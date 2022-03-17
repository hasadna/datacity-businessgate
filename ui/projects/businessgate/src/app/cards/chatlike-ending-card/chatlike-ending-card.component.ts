import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { first, switchMap, tap } from 'rxjs/operators';
import { BackendService } from '../../backend.service';
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

  constructor(private widget: WidgetsService, private backend: BackendService) { }

  ngOnInit(): void {
  }

  close() {
    this.closed.emit();
  }

  openChat() {
    const record = this.params.__runner.record;
    this.widget.moreInfoChat.next({
      goodbyeMessage: this.stack.goodbye,
      owner: this.stack.owner,
      email_address: record.email_address
    });
    this.widget.moreInfoChatDone.pipe(
      first(),
      tap((result) => {
        if (result.email_address) {
          record.email_address = result.email_address;
        }
        if (result.phone_number) {
          record.phone_number = result.phone_number;
        }
        record.questions = record.questions || {};
        const key = this.params.__runner.fillIn(`${this.stack.module}: ${this.stack.title} ${this.stack.subtitle}`);
        record.questions[key] = record.questions[key] || [];
        record.questions[key].push(...(result.questions || []));  
      }),
      switchMap((result) => {
        return this.backend.sendDirectQuestion(record, this.stack.owner, result.questions || []);
      })
    ).subscribe(() => {
      this.close();
    })
  }

}
