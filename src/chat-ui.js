'use strict';
(() => {
  const api=window.anon.chat, $=s=>document.querySelector(s);
  let state, notesDirty=false, operation=false, submitting=false, lastMessages='';
  try{$('#chat-input').value=localStorage.getItem('anon-chat-draft')?.slice(0,2000)||'';}catch{}
  $('#chat-input').addEventListener('input',()=>{try{localStorage.setItem('anon-chat-draft',$('#chat-input').value);}catch{}});
  const status=(text,error=false)=>{$('#chat-status').textContent=text;$('#chat-status').dataset.error=String(error);};
  async function unwrap(promise){const r=await promise;if(!r?.ok)throw new Error(r?.error||'操作失败，请稍后重试。');return r.data;}
  function showTab(tab){const chat=tab==='chat';$('#chat-section').hidden=!chat;$('#companion-layout').hidden=chat;$('.preferences').hidden=chat;$('#chat-tab').setAttribute('aria-pressed',String(chat));$('#companion-tab').setAttribute('aria-pressed',String(!chat));}
  $('#chat-tab').addEventListener('click',()=>showTab('chat'));$('#companion-tab').addEventListener('click',()=>showTab('companion'));window.anon.onTab(showTab);
  window.anon.getTab().then(showTab);
  function providerFields(){const local=$('#chat-provider').value==='ollama';$('#ollama-fields').hidden=!local;$('#deepseek-fields').hidden=local;$('#deepseek-model').required=!local;$('#connection-notice').textContent=local?'消息和记忆只发给这台电脑上的 Ollama。请使用具备聊天能力的本机模型。':'使用 DeepSeek 时，消息、近期对话和固定记忆会发送给 DeepSeek，并按 API 用量计费。';}
  $('#chat-provider').addEventListener('change',providerFields);
  function hydrate(){const c=state.config;$('#chat-provider').value=c.provider;$('#deepseek-model').value=c.deepseekModel;$('#ollama-url').value=c.ollamaUrl;$('#ollama-model').value=c.ollamaModel;$('#key-status').textContent=c.hasKey?'密钥已加密保存；留空会继续使用原密钥。':'密钥由 Windows 加密保存。';$('#delete-key').hidden=!c.hasKey;providerFields();controls();}
  function connectionDirty(){if(!state)return false;const c=state.config,p=$('#chat-provider').value;return p!==c.provider||(p==='deepseek'?$('#deepseek-model').value.trim()!==c.deepseekModel||!!$('#api-key').value.trim():$('#ollama-url').value!==c.ollamaUrl||$('#ollama-model').value.trim()!==c.ollamaModel);}
  function controls(){const busy=!!state?.busy||submitting;$('#chat-send').disabled=busy||operation||!state||connectionDirty();$('#chat-cancel').hidden=!busy;$('#chat-input').readOnly=busy;for(const c of document.querySelectorAll('#connection-form input,#connection-form select,#connection-form button,#save-memory,#clear-history,#clear-memory,.remember-button'))c.disabled=busy||operation;}
  for(const type of ['input','change'])$('#connection-form').addEventListener(type,()=>{controls();if(connectionDirty())status('连接设置有未保存的修改，请先点击“保存设置”，再发送消息。');});
  function render(next){
    const badge=$('.offline');if(badge)badge.lastChild.textContent=next.config.provider==='deepseek'&&next.config.hasKey?' DeepSeek 聊天 · 按需联网':' 本地陪伴 · 聊天可选连接';
    state=next;$('#chat-provider-label').textContent=state.config.provider==='ollama'?`Ollama · ${state.config.ollamaModel||'未选模型'}`:`DeepSeek · ${state.config.hasKey?state.config.deepseekModel:'未填密钥'}`;
    if(!notesDirty)$('#memory-notes').value=state.notes;
    const serialized=JSON.stringify(state.messages);
    if(lastMessages!==serialized){const log=$('#chat-log'),bottom=log.scrollTop+log.clientHeight>=log.scrollHeight-60;log.replaceChildren();
      if(!state.messages.length){const p=document.createElement('p');p.className='chat-empty';p.textContent='你忙碌的一天，也可以在这里说给我听。\n先连接一个聊天模型吧 ♡';log.append(p);}
      for(const message of state.messages){const row=document.createElement('div');row.className='message '+message.role;const label=document.createElement('span');label.className='message-label';label.textContent=message.role==='user'?'你':'爱音';const text=document.createElement('p');text.textContent=message.content;row.append(label,text);
        if(message.role==='user'){const pin=document.createElement('button');pin.type='button';pin.className='remember-button';pin.textContent='记住这句 ♡';pin.addEventListener('click',()=>remember(message.content));row.append(pin);}log.append(row);}
      lastMessages=serialized;if(bottom||submitting)log.scrollTop=log.scrollHeight;
    }controls();
  }
  async function run(task){if(operation)return;operation=true;controls();try{await task();}catch(e){status(e.message,true);}finally{operation=false;controls();}}
  const patch=()=>({provider:$('#chat-provider').value,deepseekModel:$('#deepseek-model').value,ollamaUrl:$('#ollama-url').value,ollamaModel:$('#ollama-model').value,apiKey:$('#api-key').value});
  async function saveConnection(){const next=await unwrap(api.configure(patch()));$('#api-key').value='';render(next);hydrate();}
  $('#connection-form').addEventListener('submit',e=>{e.preventDefault();run(async()=>{await saveConnection();status('连接设置已保存。可以测试连接，或直接开始聊天。');});});
  function showModels(models){$('#ollama-models').replaceChildren(...models.map(name=>{const o=document.createElement('option');o.value=name;return o;}));const chatModels=models.filter(name=>!/embed|bge-|nomic|all-minilm/i.test(name));if(!$('#ollama-model').value&&chatModels.length)$('#ollama-model').value=chatModels[0];$('#model-help').textContent=models.length?`检测到：${models.join('、')}。${chatModels.length?'选择聊天模型后，记得保存设置。':'当前检测到的都是嵌入模型，请先在 Ollama 安装聊天模型。'}`:'服务已连接，还没有安装模型。请在 Ollama 安装聊天模型，再重新检测。';}
  $('#detect-models').addEventListener('click',()=>run(async()=>{await saveConnection();showModels(await unwrap(api.models()));status('本机模型检测完成。');}));
  $('#test-connection').addEventListener('click',()=>run(async()=>{await saveConnection();status('正在测试连接……');const r=await unwrap(api.test());if(state.config.provider==='ollama')showModels(r.models);status(r.message);}));
  $('#delete-key').addEventListener('click',()=>run(async()=>{if(!confirm('删除这台电脑上保存的 DeepSeek API Key？'))return;render(await unwrap(api.configure({removeKey:true})));$('#api-key').value='';hydrate();status('已删除密钥。');}));
  $('#memory-notes').addEventListener('input',()=>{notesDirty=true;status('长期记忆有未保存的修改，点击“保存长期记忆”后生效。');});
  async function remember(content){if(state?.busy||operation)return;await run(async()=>{const notes=[$('#memory-notes').value.trim(),content].filter(Boolean).join('\n');if(notes.length>2000)throw new Error('长期记忆已超过 2000 字，请先精简一下。');const next=await unwrap(api.notes(notes));notesDirty=false;render(next);status('这句话已加入长期记忆，下次聊天也会带上。');});}
  $('#save-memory').addEventListener('click',()=>run(async()=>{const next=await unwrap(api.notes($('#memory-notes').value));notesDirty=false;render(next);status('长期记忆已保存。');}));
  for(const[id,scope]of[['#clear-history','history'],['#clear-memory','all']])$(id).addEventListener('click',()=>run(async()=>{if(!confirm(scope==='all'?'清除全部聊天记录和固定的长期记忆？此操作无法撤销。':'清除聊天记录？固定的长期记忆会保留。'))return;const next=await unwrap(api.clear(scope));if(scope==='all'){$('#chat-input').value='';try{localStorage.removeItem('anon-chat-draft');}catch{}}notesDirty=false;render(next);status(scope==='all'?'全部对话记忆已清除。':'聊天记录已清除，长期记忆仍然保留。');}));
  $('#chat-form').addEventListener('submit',async e=>{e.preventDefault();if(submitting||operation||state?.busy)return;if(connectionDirty()){status('先保存连接设置，再发送消息。',true);return;}const text=$('#chat-input').value.trim();if(!text)return;submitting=true;controls();status('爱音正在想怎么回复……');try{await unwrap(api.send(text));$('#chat-input').value='';try{localStorage.removeItem('anon-chat-draft');}catch{}render(await unwrap(api.get()));status('已回复并保存这轮对话。');}catch(e){status(e.message,true);}finally{submitting=false;controls();$('#chat-input').focus();}});
  $('#chat-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();$('#chat-form').requestSubmit();}});
  $('#chat-cancel').addEventListener('click',async()=>{try{await unwrap(api.cancel());status('正在取消……');}catch(e){status(e.message,true);}});
  api.onUpdate(render);unwrap(api.get()).then(next=>{render(next);hydrate();if(next.messages.length)status('上次的聊天记录已经回来了。');}).catch(e=>status(e.message,true));
})();
