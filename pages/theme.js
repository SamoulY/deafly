// Runs before styles to avoid flashing the wrong stored appearance on reload.
(() => {
  const key='defly.appearance',media=window.matchMedia('(prefers-color-scheme: dark)');
  const valid=value=>['light','dark','system'].includes(value)?value:'system';
  let preference='system';
  try {preference=valid(localStorage.getItem(key));} catch { /* Appearance works without storage. */ }
  function apply() {
    const theme=preference==='system'?(media.matches?'dark':'light'):preference;
    document.documentElement.dataset.theme=theme;
    document.documentElement.dataset.themePreference=preference;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#101a16':'#ffffff');
    document.querySelectorAll('[data-theme-choice]').forEach(select=>select.value=preference);
    document.dispatchEvent(new CustomEvent('defly-theme-change',{detail:{theme,preference}}));
  }
  apply();
  media.addEventListener('change',()=>{if(preference==='system')apply();});
  document.addEventListener('change',event=>{
    if(!event.target.matches('[data-theme-choice]'))return;
    preference=valid(event.target.value);
    try {localStorage.setItem(key,preference);} catch { /* Keep this tab's selection. */ }
    apply();
  });
  window.addEventListener('storage',event=>{if(event.key===key){preference=valid(event.newValue);apply();}});
})();
