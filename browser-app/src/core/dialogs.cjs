'use strict';
const crypto = require('node:crypto');

class Dialogs {
  constructor({ onChange, onFlush, onShow, onDone, reduceMotion }) {
    this.onChange = onChange;
    this.onFlush = onFlush;
    this.onShow = onShow;
    this.onDone = onDone;
    this.reduceMotion = reduceMotion;
    this.question = null;
    this.queue = [];
    this.message = '';
    this.timer = null;
  }

  get current() {
    if (!this.question) return null;
    const q = this.question;
    return {
      id: q.id,
      title: q.title,
      text: q.text || '',
      detail: q.detail || '',
      note: q.note || '',
      icon: q.icon || 'info',
      tone: q.tone || 'primary',
      buttons: q.buttons
    };
  }

  get pendingCount() {
    return this.queue.length;
  }

  hasClosing() {
    return !!(this.question?.closing || this.queue.some(q => q.closing));
  }

  report(error) {
    this.message = String(error?.message || error).slice(0, 300);
    this.onChange();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.message = '';
      this.onChange();
    }, 10000);
  }

  notify(text) {
    this.message = String(text || '');
    this.onChange();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.message = '';
      this.onChange();
    }, 3500);
  }

  clearMessage() {
    clearTimeout(this.timer);
    this.message = '';
  }

  ask(spec) {
    return new Promise(resolve => {
      this.queue.push({ ...spec, id: crypto.randomUUID(), resolve });
      if (!this.question) this.next();
    });
  }

  async confirm(spec) {
    const choice = await this.ask({
      ...spec,
      buttons: [
        { id: 'cancel', label: spec.cancel || 'Cancel' },
        { id: 'ok', label: spec.confirm, tone: spec.tone === 'danger' ? 'danger' : 'primary' }
      ]
    });
    return choice === 'ok';
  }

  next() {
    this.question = this.queue.shift() || null;
    if (this.question) this.onShow?.();
    this.onFlush();
  }

  answer(id, choice) {
    if (!this.question || this.question.id !== id) return;
    const q = this.question;
    this.question = null;
    q.resolve(q.buttons.some(b => b.id === choice) ? choice : 'cancel');
    this.onFlush();
    if (this.queue.length) {
      setTimeout(() => this.next(), this.reduceMotion() ? 0 : 160);
    } else {
      this.onDone?.();
    }
  }
}

module.exports = { Dialogs };
