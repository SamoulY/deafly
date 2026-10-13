import {initialTeachingModel,taughtDecision,TEACHING_BACKEND} from './companion-learning.mjs';

// Compare one frozen decision, keeping the neural signal, scene and position fixed.
// This attributes the combined personal head, not any single demonstration.
export function compareTeaching(model, features, decoder, portfolio) {
  const baseline=taughtDecision(initialTeachingModel(),features,decoder,portfolio);
  const learned=taughtDecision(model,features,decoder,portfolio);
  const effect=!model.version?'no_examples':!decoder.gate_spikes?'inactive':learned.action!==baseline.action?'changed':'same_choice';
  return {schema:'companion-comparison-v1',effect,without_teaching:baseline.action,with_teaching:learned.action,examples_learned:model.version};
}

export function recordedTeachingEvidence(decision, frozen) {
  const provenance=decision.portfolio?.provenance, teaching=provenance?.teaching;
  const saved=teaching?.comparison;
  if (saved?.schema==='companion-comparison-v1' && saved.with_teaching===decision.action) return saved;
  if (teaching?.model_version===0) return {effect:'no_examples',examples_learned:0};
  // Old releases stored enough frozen input to replay the same comparison safely.
  // Do not guess from a label or associate a later model with an earlier decision.
  if (!frozen?.checkpoint_json || teaching?.backend!==TEACHING_BACKEND || frozen.model_hash!==teaching.model_hash) return {effect:'unavailable'};
  try {
    const model=JSON.parse(frozen.checkpoint_json), features=JSON.parse(frozen.features_json);
    if (model.version!==teaching.model_version || ![-1,0,1].includes(features[4]) || !(features[3]>=0)) return {effect:'unavailable'};
    const portfolio={cash:features[3]*10000,position_side:features[4]===1?'LONG':features[4]===-1?'SHORT':'FLAT'};
    const comparison=compareTeaching(model,features,provenance.decoder,portfolio);
    return comparison.with_teaching===decision.action ? comparison : {effect:'unavailable'};
  } catch { return {effect:'unavailable'}; }
}
