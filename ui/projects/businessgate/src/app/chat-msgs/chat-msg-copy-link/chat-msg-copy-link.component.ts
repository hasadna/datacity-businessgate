import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-chat-msg-copy-link',
  templateUrl: './chat-msg-copy-link.component.html',
  styleUrls: ['./chat-msg-copy-link.component.less']
})
export class ChatMsgCopyLinkComponent implements OnInit {

  @Input() params;
  @Input() content;

  clipboardSupported = false;
  copied = false;

  constructor() {
    try {
      this.clipboardSupported = document.queryCommandSupported && document.queryCommandSupported('copy');
    } catch (e) {
      console.log('Failed to check if copy clipboard is available');
    }
  }

  clipboardCopy(): string {
    if (!this.clipboardSupported) {
      return;
    }
    const text = this.link;
    const txt = document.createElement('textarea');
    txt.textContent = text;
    txt.classList.add('visually-hidden');
    document.body.appendChild(txt);
    txt.select();
    try {
      document.execCommand('copy');
      this.copied = true;
    } catch (ex) {
    } finally {
      document.body.removeChild(txt);
    }
  }

  ngOnInit(): void {
  }

  wait() {
    return Promise.resolve(false);
  }

  get link() {
    return this.params.__runner.record.self_link || window.location.href;
  }
}
