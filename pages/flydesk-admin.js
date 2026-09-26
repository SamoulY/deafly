export function mountDeskAdmin(api){
 const root=document.createElement('details');root.className='desk-admin';root.innerHTML='<summary>数据与训练运行状态</summary><button data-refresh>读取管理状态</button><label>导入历史数据 JSON <input type="file" accept="application/json,.json"></label><p role="status">仅配置的管理员可读取或导入数据。</p><pre></pre>';document.querySelector('main').append(root);
 const status=root.querySelector('[role=status]'),output=root.querySelector('pre');
 root.querySelector('[data-refresh]').onclick=async()=>{try{const d=await api('/api/flydesk/admin');output.textContent=JSON.stringify(d,null,2);status.textContent='状态已更新';}catch(e){status.textContent=e.message;}};
 root.querySelector('input').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>15*1024*1024)throw Error('数据文件超过 15 MB');const data=JSON.parse(await file.text());status.textContent='正在验证并导入';const r=await api('/api/flydesk/datasets',{method:'POST',body:data});output.textContent=JSON.stringify(r,null,2);status.textContent='导入成功，刷新页面后选择数据集';}catch(error){status.textContent=error.message;}};
}
