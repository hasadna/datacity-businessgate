import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { first } from 'rxjs/operators';
import { WidgetsService } from '../../widgets.service';

@Component({
  selector: 'app-chatlike-ending-card',
  templateUrl: './chatlike-ending-card.component.html',
  styleUrls: ['./chatlike-ending-card.component.less']
})
export class ChatlikeEndingCardComponent implements OnInit {

  @Input() width = 0;
  @Input() stack;
  @Input() params;

  @Output() closed = new EventEmitter<void>();

  constructor(private widget: WidgetsService) { }

  ngOnInit(): void {
  }

  close() {
    this.closed.emit();
  }

  openChat() {
    const record = this.params.__runner.record;
    this.widget.moreInfoChat.next({
      goodbyeMessage: this.stack.goodbye,
      email_address: record.email_address
    });
    this.widget.moreInfoChatDone.pipe(
      first()
    ).subscribe((result) => {
      record.email_address = record.email_address || result.email_address;
      record.questions = record.questions || {};
      record.questions[this.stack.name] = record.questions[this.stack.name] || [];
      record.questions[this.stack.name].push(...result.questions);
      this.close();
    })
  }

}
