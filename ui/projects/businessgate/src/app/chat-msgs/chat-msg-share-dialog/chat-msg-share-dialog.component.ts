import { AfterContentInit, Component, Input, OnInit } from '@angular/core';
import { ContentManager } from 'hatool';

@Component({
  selector: 'app-chat-msg-share-dialog',
  templateUrl: './chat-msg-share-dialog.component.html',
  styleUrls: ['./chat-msg-share-dialog.component.less']
})
export class ChatMsgShareDialogComponent implements OnInit, AfterContentInit {

  @Input() params;
  @Input() content;

  constructor() { }

  ngOnInit(): void {
  }

  ngAfterContentInit() {
    if (window['__sharethis__']) {
      window['__sharethis__'].load('inline-share-buttons', {
        alignment: 'center',
        id: 'share-buttons',
        enabled: true,
        font_size: 16,
        has_spacing: true,
        padding: 12,
        radius: 24,
        networks: ['twitter', 'facebook', 'sms', 'whatsapp', 'messenger', 'gmail', 'email'],
        size: 48,
        size_label: 'large',
        show_mobile_buttons: true,
        spacing: 8,
        url: "https://br7biz.org.il",
        title: document.title
      });
    }
  }

  wait() {
    return Promise.resolve(false);
  }
}
