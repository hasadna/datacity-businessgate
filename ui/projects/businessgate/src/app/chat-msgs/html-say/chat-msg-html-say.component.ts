import { Component, Input, OnInit } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-chat-msg-html-say',
  templateUrl: './chat-msg-html-say.component.html',
  styleUrls: ['./chat-msg-html-say.component.less']
})
export class ChatMsgHtmlSayComponent implements OnInit {

  @Input() params;
  @Input() content;

  html: SafeHtml;

  constructor(private santizer: DomSanitizer) {
  }

  ngOnInit(): void {
    this.html = this.santizer.bypassSecurityTrustHtml(this.params['html-say']);
  }

  wait() {
    return Promise.resolve(false);
  }
}
