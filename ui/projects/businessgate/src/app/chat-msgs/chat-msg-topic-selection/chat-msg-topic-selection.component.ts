import { Component, Input, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { first } from 'rxjs/operators';

@Component({
  selector: 'app-chat-msg-topic-selection',
  templateUrl: './chat-msg-topic-selection.component.html',
  styleUrls: ['./chat-msg-topic-selection.component.less']
})
export class ChatMsgTopicSelectionComponent implements OnInit {

  @Input() params;
  @Input() content;

  choices: any[] = [];
  responses: any = {};
  record: any = {};
  returnValue = new Subject<string>();
  submitted = false

  constructor() { }

  ngOnInit(): void {
    this.record = this.params['__runner']['record'];
    this.choices = this.params['topic-selection']['choices'].filter(c => this.allowed(c));
    this.responses = this.params['topic-selection']['responses'];
    if (!this.record.topics) {
      this.record.topics = {};
      this.choices.forEach(c => this.record.topics[c.id] = c.default);
    }
    console.log('TOP RRRR', this.record.topics.tips);
    if (this.params.__runFast) {
      this.submit();
    }
  }

  toggle(choice) {
    if (!this.submitted) {
      this.record.topics[choice.id] = !this.record.topics[choice.id];
    }
  }

  allowed(choice) {
    const has = {
      business_kind: !!this.record.סוג_עסק,
      location: !!this.record.מיקום,
    };
    const requires = {
      business_kind: choice.requires.indexOf('business_kind') >= 0,
      location: choice.requires.indexOf('location') >= 0,
    }
    console.log('TOP HAS', has, 'REQUIRES', requires);
    return (!requires.business_kind || !!has.business_kind) && (!requires.location || !!has.location);
  }

  enabled(choice) {
    return !!this.record.topics[choice.id];
  }

  wait() {
    return this.returnValue.toPromise();
  }

  selectedSome() {
    return !this.selectedAll() && !this.selectedNone();
  }

  selectedNone() {
    return this.choices.filter(c => this.record.topics[c.id]).length === 0;
  }

  selectedAll() {
    return this.choices.filter(c => this.record.topics[c.id]).length === this.choices.length;
  }

  submit() {
    if (!this.submitted) {
      const option = this.selectedAll() ? 'all' : (this.selectedNone() ? 'none' : 'default');
      const response = this.responses[option];
      this.record._skipped_topic_selection = option === 'none';
      console.log('SUBMIT', option, response.show);
      this.returnValue.next(response.show);
      this.returnValue.complete();
      this.submitted = true;
    }
  }
}
