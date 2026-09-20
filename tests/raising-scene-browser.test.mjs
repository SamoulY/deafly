import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

test('scene outfits change cosmetic/background rendering without changing market snapshot or retinal view', async () => {
  const server = createServer(async (req,res) => {
    if(req.url === '/') { res.setHeader('Content-Type','text/html'); return res.end('<style>body{margin:0;background:#060709}canvas{width:900px;height:650px}</style><canvas id="fly"></canvas><canvas id="vision" hidden></canvas>'); }
    try { const file = new URL('../pages/' + req.url.slice(1), import.meta.url); res.setHeader('Content-Type','text/javascript'); res.end(await readFile(file)); } catch {res.statusCode=404;res.end();}
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser = await chromium.launch({headless:true});
    const page = await browser.newPage({viewport:{width:900,height:650}});
    const errors=[]; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const result = await page.evaluate(async () => {
      const THREE = await import('/vendor-three.js');
      const scenes=[]; const add=THREE.Scene.prototype.add;
      THREE.Scene.prototype.add=function(...objects){ if(!scenes.includes(this))scenes.push(this); return add.apply(this,objects); };
      const {startScene,startVisionScene}=await import('/scene.js');
      const canvas=document.querySelector('#fly');
      const view=startScene(canvas,[10,20,12,24]); view.setPaused(true);
      const retina=startVisionScene(document.querySelector('#vision'),[10,20,12,24]); retina.setVisible(true); retina.setVisible(false);
      const monitor=[]; scenes[0].traverse(o=>{if(o.userData.monitorCanvas)monitor.push(o);});
      const before=monitor[0].userData.monitorCanvas.toDataURL();
      const chartCanvas=monitor[0].userData.monitorCanvas;
      view.updateMarket([]);
      const pixels=chartCanvas.getContext('2d').getImageData(0,0,640,360).data;
      let green=0; for(let i=0;i<pixels.length;i+=4) if(pixels[i]===189&&pixels[i+1]===255&&pixels[i+2]===50)green++;
      if(green>0) throw new Error('Empty market invents chart pixels');
      view.updateMarket([10,20,12,24]);
      const visionBefore=scenes[1].toJSON();
      if(typeof view.setOutfit !== 'function') return {hasSetOutfit:false};
      const loadout={head:'head-cap',face:'face-glasses',body:'body-bowtie',background:'background-mint'};
      const normalized=view.setOutfit(loadout); view.setVisible(true);
      const background=scenes[0].background.getHexString();
      const after=monitor[0].userData.monitorCanvas.toDataURL();
      const visionSame=JSON.stringify(visionBefore)===JSON.stringify(scenes[1].toJSON());
      const fly=scenes[0].getObjectByName('Compound eye fly');
      const direction=new THREE.Vector3(0,0,1).applyQuaternion(fly.quaternion);
      view.setVisible(false); const frame=canvas.dataset.litFrame;
      await new Promise(r=>setTimeout(r,220));
      const stopped=frame===canvas.dataset.litFrame;
      view.setOutfit(null); const defaultBackground=scenes[0].background.getHexString();
      view.setOutfit(loadout); view.setVisible(true);
      return {hasSetOutfit:true,normalized,background,defaultBackground,snapshotSame:before===after,visionSame,stopped,direction:direction.toArray()};
    });
    assert.equal(result.hasSetOutfit,true,'startScene exposes setOutfit');
    assert.equal(result.snapshotSame,true); assert.equal(result.visionSame,true);
    assert.equal(result.stopped,true); assert.ok(result.direction[0]>.99);
    assert.notEqual(result.background,result.defaultBackground); assert.equal(result.defaultBackground,'060709');
    assert.equal(result.normalized.head,'head-cap');
    await page.screenshot({path:'/tmp/defly-refined-outfit.png'});
    assert.deepEqual(errors,[]);
  } finally { await browser?.close(); await new Promise(r=>server.close(r)); }
});
