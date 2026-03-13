// Admin behaviors for ClickBloom
(function(){
  function copy(val, btn){
    function done(){ if(btn){ var prev = btn.innerHTML; btn.textContent = 'Copied!'; setTimeout(function(){ btn.innerHTML = prev; }, 1200);} }
    function fallback(){ try{
      var ta = document.createElement('textarea'); ta.value = val; ta.setAttribute('readonly',''); ta.style.position='absolute'; ta.style.left='-9999px';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); done();
    }catch(e){ window.prompt('Copy:', val); }
    }
    if(navigator.clipboard && window.isSecureContext){ navigator.clipboard.writeText(val).then(done).catch(fallback); } else { fallback(); }
  }

  function onReady(){
    // Copy buttons with data-copy
    document.querySelectorAll('.cb-copy').forEach(function(b){
      b.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); var v = b.getAttribute('data-copy') || ''; copy(v, b); });
    });
    // Copy API key: read from data-copy or #cb_api_key
    document.querySelectorAll('.cb-copy-key').forEach(function(b){
      b.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); var v = b.getAttribute('data-copy') || ''; if(!v){ var i = document.getElementById('cb_api_key'); v = i && i.value ? i.value : ''; } copy(v, b); });
    });
    // Toggle-all for settings
    var ta = document.getElementById('cb_toggle_all');
    var th = document.getElementById('cb_toggle_all_hidden');
    if(ta){
      ta.addEventListener('change', function(){
        var f = ta.closest('form'); if(!f) return;
        ['title','meta','image_alt','link_titles','schema','canonical'].forEach(function(name){
          var el = f.querySelector('input[name="'+name+'"]'); if(el){ el.checked = ta.checked; }
        });
        if(th){ th.value = ta.checked ? '1' : ''; }
      });
    }
  }
  if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', onReady); } else { onReady(); }
})();
