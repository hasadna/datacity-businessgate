import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { ContentManager, ScriptRunnerImpl } from 'hatool';
import { first, switchMap, tap } from 'rxjs/operators';
import { ConfigService } from '../../config.service';
import { WidgetsService } from '../../widgets.service';

import { environment } from '../../../environments/environment';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-widget-more-info-chat',
  templateUrl: './widget-more-info-chat.component.html',
  styleUrls: ['./widget-more-info-chat.component.less']
})
export class WidgetMoreInfoChatComponent implements OnInit {

  content: ContentManager;
  runner: ScriptRunnerImpl;
  config = null;
  open = false;
  record: any = {};
  owner: any = {};
  chatSub: Subscription = null;

  constructor(private widget: WidgetsService, private http: HttpClient, private configSvc: ConfigService) {
    this.configSvc.config.pipe(
      first()
    ).subscribe((config) => {
      this.config = config;
    });
    this.subscribe();
  }

  subscribe() {
    this.widget.moreInfoChat.pipe(
      switchMap((params) => {
        this.open = true;
        this.owner = params.owner;
        this.content = new ContentManager();
        this.runner = new ScriptRunnerImpl(this.http, this.content, this.config.locale);
        this.runner.timeout = environment.timeout;
        this.content.sendButtonText = '';
        this.content.inputPlaceholder = '';
        // this.content.debug = true;
        // this.runner.debug = true;
        this.record = {};
        if (params.email_address) {
          this.record.email_address = params.email_address;
        }
        this.content.addTo(params.goodbyeMessage);
        this.content.queueFrom('יש לי עוד שאלה');
        return this.runner.run(
          this.config,
          1,
          {
            process_question: (record) => {
              record.questions = record.questions || [];
              record.questions.push(record.question);
            },
          },
          async (key, value, record) => {},
          this.record
        );
      }),
    ).subscribe((res) => {
      this.open = false;
      this.widget.moreInfoChatDone.next(this.record);
    });
  }

  ngOnInit(): void {
  }

  close() {
    if (this.chatSub) {
      this.chatSub.unsubscribe();
      this.subscribe();
    }
    this.open = false;
    this.widget.moreInfoChatDone.next(this.record);
  }
}
