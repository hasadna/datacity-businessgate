import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-chat-msg-image',
  templateUrl: './chat-msg-image.component.html',
  styleUrls: ['./chat-msg-image.component.less']
})
export class ChatMsgImageComponent implements OnInit {

  @Input() params;
  @Input() content;

  constructor() { }

  ngOnInit(): void {
  }

  wait() {
    return Promise.resolve(false);
  }

}
