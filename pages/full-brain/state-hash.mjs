// Cache only the immutable contact-count alias after createBrain's sign correction.
// Preserve the legacy state inventory and ordering, hence checkpoint hash compatibility.
export function createStateHasher(arrays, hash) {
  const contact = arrays.contact;
  const weight = arrays.weight;
  if (!contact || weight !== contact) throw Error('Expected immutable weight/contact alias');
  let weightHash;
  const bytes = a => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  return {
    async checkpointHash(learning, sensory) {
      if (arrays.contact !== contact || arrays.weight !== weight) throw Error('Model alias changed; recreate state hasher');
      const states = [];
      for (const [name, a] of Object.entries(arrays)) {
        if (['post', 'contact', 'ids'].includes(name)) continue;
        const digest = name === 'weight'
          ? await (weightHash ??= hash(bytes(a)))
          : await hash(bytes(a));
        states.push([name, digest]);
      }
      for (const [name, a] of Object.entries({...learning, ...sensory})) states.push([name, await hash(bytes(a))]);
      return hash(new TextEncoder().encode(JSON.stringify(states)));
    },
  };
}
