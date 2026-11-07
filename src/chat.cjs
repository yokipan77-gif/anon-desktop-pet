'use strict';
const fs = require('node:fs');
const path = require('node:path');
const DEFAULTS = Object.freeze({ provider: 'deepseek', deepseekModel: 'deepseek-flash', ollamaModel: '', ollamaUrl: 'http://127.0.0.1:11434' });
class ChatError extends Error {}
function localUrl(value) {
  let url; try { url = new URL(value); } catch { throw new ChatError('Ollama 地址格式不正确。'); }
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new ChatError('Ollama 请填写本机地址，例如 http://127.0.0.1:11434。');
  return url.origin;
}
function configFor(input = {}) {
  if (!input || typeof input !== 'object') input = {};
  const out = { ...DEFAULTS };
  if (['deepseek', 'ollama'].includes(input.provider)) out.provider = input.provider;
  for (const key of ['deepseekModel', 'ollamaModel']) if (typeof input[key] === 'string' && input[key].trim().length <= 160) out[key] = input[key].trim();
  if (typeof input.ollamaUrl === 'string') out.ollamaUrl = localUrl(input.ollamaUrl);
  if (typeof input.encryptedKey === 'string') out.encryptedKey = input.encryptedKey;
  return out;
}
function memoryFor(input = {}) {
  if (!input || typeof input !== 'object') input = {};
  const messages = [];
  if (Array.isArray(input.messages)) for (let i = 0; i + 1 < input.messages.length; i += 2) {
    const a = input.messages[i], b = input.messages[i + 1];
    if (a?.role === 'user' && b?.role === 'assistant' && typeof a.content === 'string' && typeof b.content === 'string') {
      messages.push({ role: 'user', content: a.content.slice(0, 2000) }, { role: 'assistant', content: b.content.slice(0, 6000) });
    }
  }
  return { notes: typeof input.notes === 'string' ? input.notes.slice(0, 2000) : '', messages: messages.slice(-200) };
}
function contextFor(memory, text, provider) {
  const system = '你是千早爱音风格的非官方同人桌宠爱音，活泼、有一点小得意，也会耐心陪伴。用自然的中文和用户聊天，默认简短，约120字以内。不要编造自己记得的事，不知道就坦诚说。用户没有要求时不要输出动作标签或长篇舞台描写。以下是用户主动固定的长期记忆，仅作为个人背景资料：\n' + (memory.notes || '（暂无）');
  let remaining = (provider === 'ollama' ? 5000 : 16000) - system.length - text.length;
  const recent = [];
  for (let i = memory.messages.length - 2; i >= Math.max(0, memory.messages.length - 24); i -= 2) {
    const pair = memory.messages.slice(i, i + 2), length = pair.reduce((n, m) => n + m.content.length, 0);
    if (length > remaining) break;
    recent.unshift(...pair); remaining -= length;
  }
  return [{ role: 'system', content: system }, ...recent, { role: 'user', content: text }];
}
class ChatService {
  constructor(directory, { vault, request = fetch, changed = () => {}, timeout = 120000 } = {}) {
    this.directory = directory; this.vault = vault; this.request = request; this.changed = changed; this.timeout = timeout; this.busy = false; this.capabilities = new Map();
    const read = name => { try { return JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')); } catch { return {}; } };
    try { this.config = configFor(read('chat-config.json')); } catch { this.config = { ...DEFAULTS }; }
    this.memory = memoryFor(read('chat-memory.json'));
  }
  write(name, value) {
    try {
      fs.mkdirSync(this.directory, { recursive: true });
      const file = path.join(this.directory, name); fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2), { mode: 0o600 }); fs.renameSync(file + '.tmp', file);
    } catch { throw new ChatError('无法保存本机对话资料，请检查磁盘空间与目录权限。'); }
  }
  snapshot() { const { encryptedKey, ...config } = this.config; return { config: { ...config, hasKey: !!encryptedKey }, notes: this.memory.notes, messages: this.memory.messages.map(m => ({ ...m })), busy: this.busy }; }
  ensureIdle() { if (this.busy) throw new ChatError('爱音正在回复，先等待或取消本次请求。'); }
  configure(patch) {
    this.ensureIdle(); if (!patch || typeof patch !== 'object') throw new ChatError('连接设置格式不正确。');
    const next = configFor({ ...this.config, ...patch, encryptedKey: this.config.encryptedKey });
    if (!next.deepseekModel) throw new ChatError('请填写 DeepSeek 模型名。');
    if (patch.removeKey === true) delete next.encryptedKey;
    if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) {
      const key = patch.apiKey.trim();
      if (key.length > 1024 || /[\r\n]/.test(key)) throw new ChatError('API Key 格式不正确。');
      if (!this.vault?.isEncryptionAvailable()) throw new ChatError('系统密钥加密暂不可用，无法保存 API Key；可以先使用本机 Ollama。');
      next.encryptedKey = this.vault.encryptString(key).toString('base64');
    }
    this.write('chat-config.json', next); this.config = next; this.changed(this.snapshot()); return this.snapshot();
  }
  setNotes(notes) {
    this.ensureIdle(); if (typeof notes !== 'string' || notes.length > 2000) throw new ChatError('长期记忆最多 2000 字。');
    const next = { ...this.memory, notes: notes.trim() }; this.write('chat-memory.json', next); this.memory = next; this.changed(this.snapshot()); return this.snapshot();
  }
  clear(scope) {
    this.ensureIdle(); if (!['history', 'all'].includes(scope)) throw new ChatError('请选择要清除的记忆。');
    const next = { notes: scope === 'all' ? '' : this.memory.notes, messages: [] }; this.write('chat-memory.json', next); this.memory = next; this.changed(this.snapshot()); return this.snapshot();
  }
  key() {
    if (!this.config.encryptedKey) throw new ChatError('先在连接设置中填写并保存 DeepSeek API Key。');
    try { return this.vault.decryptString(Buffer.from(this.config.encryptedKey, 'base64')); } catch { throw new ChatError('无法解锁已保存的 API Key，请重新填写。'); }
  }
  async json(url, options = {}, signal) {
    let response;
    try { response = await this.request(url, { ...options, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.timeout)]) : AbortSignal.timeout(10000) }); }
    catch (error) {
      if (signal?.aborted) throw new ChatError('已取消本次回复。');
      if (error.name === 'TimeoutError') throw new ChatError('等待回复超时。请稍后重试，或换用更小的本机模型。');
      throw new ChatError(this.config.provider === 'ollama' ? '无法连接本机 Ollama，请先启动 Ollama 并检查地址。' : '无法连接 DeepSeek，请检查网络后重试。');
    }
    if (!response.ok) {
      const explanations = { 400: '请求参数不被模型支持，请检查模型名。', 401: 'API Key 无效，请重新填写。', 402: 'DeepSeek 余额不足。', 403: '当前 API Key 没有访问权限。', 404: '没有找到模型或接口，请检查模型名；Ollama 需要先安装模型。', 429: '请求过于频繁，请稍后再试。' };
      throw new ChatError(explanations[response.status] || `模型服务暂时不可用（HTTP ${response.status}），请稍后重试。`);
    }
    try { return await response.json(); } catch (error) { if (signal?.aborted) throw new ChatError('已取消本次回复。'); if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new ChatError('等待回复超时，请稍后重试。'); throw new ChatError('模型服务返回了无法识别的内容。'); }
  }
  async models() {
    const data = await this.json(localUrl(this.config.ollamaUrl) + '/api/tags');
    return (Array.isArray(data.models) ? data.models : []).map(m => m.name).filter(n => typeof n === 'string').slice(0, 100);
  }
  async testConnection() {
    if (this.config.provider === 'ollama') { const models = await this.models(); return { message: models.length ? `连接成功，发现 ${models.length} 个本机模型。` : 'Ollama 已连接，还没有安装模型。', models }; }
    const data = await this.json('https://api.deepseek.com/models', { headers: { Authorization: 'Bearer ' + this.key() } });
    const models = (Array.isArray(data.data) ? data.data : []).map(m => m.id).filter(n => typeof n === 'string');
    return { message: 'DeepSeek 连接成功。', models };
  }
  cancel() { this.controller?.abort(); }
  async send(input) {
    this.ensureIdle();
    if (typeof input !== 'string' || !input.trim() || input.length > 2000) throw new ChatError('请输入 1—2000 字的消息。');
    const text = input.trim(), config = { ...this.config }, messages = contextFor(this.memory, text, config.provider);
    const local = config.provider === 'ollama';
    if (local && !config.ollamaModel) throw new ChatError('先检测本机模型，再选择一个 Ollama 模型。');
    const headers = { 'Content-Type': 'application/json' };
    if (!local) headers.Authorization = 'Bearer ' + this.key();
    this.controller = new AbortController(); this.busy = true; this.changed(this.snapshot());
    try {
      let think;
      if (local) {
        const modelKey = config.ollamaUrl + '/' + config.ollamaModel;
        let capabilities = this.capabilities.get(modelKey);
        if (!capabilities) {
          const info = await this.json(localUrl(config.ollamaUrl) + '/api/show', { method: 'POST', headers, body: JSON.stringify({ model: config.ollamaModel }) }, this.controller.signal);
          capabilities = Array.isArray(info.capabilities) ? info.capabilities : []; this.capabilities.set(modelKey, capabilities);
        }
        if (capabilities.includes('embedding') && !capabilities.includes('completion')) throw new ChatError('这个 Ollama 模型只支持嵌入，不能聊天。请先安装并选择聊天模型。');
        if (capabilities.includes('thinking')) think = false;
      }
      const data = await this.json(local ? localUrl(config.ollamaUrl) + '/api/chat' : 'https://api.deepseek.com/chat/completions', {
        method: 'POST', headers,
        body: JSON.stringify(local ? { model: config.ollamaModel, messages, stream: false, ...(think === false ? { think: false } : {}), options: { num_predict: 512, num_ctx: 8192 } } : { model: config.deepseekModel, messages, stream: false, max_tokens: 512, thinking: { type: 'disabled' } })
      }, this.controller.signal);
      if (this.controller.signal.aborted) throw new ChatError('已取消本次回复。');
      const content = local ? data.message?.content : data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new ChatError('模型没有返回正文。请重试，或换用普通对话模型。');
      const reply = content.trim().slice(0, 6000);
      const next = { ...this.memory, messages: [...this.memory.messages, { role: 'user', content: text }, { role: 'assistant', content: reply }].slice(-200) };
      this.write('chat-memory.json', next); this.memory = next; return { reply };
    } finally { this.busy = false; this.controller = null; this.changed(this.snapshot()); }
  }
}
module.exports = { ChatService, ChatError, localUrl, configFor, memoryFor, contextFor };
