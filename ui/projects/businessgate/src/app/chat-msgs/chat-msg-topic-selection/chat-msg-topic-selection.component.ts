import { Component, Input, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { BackendService } from '../../backend.service';

@Component({
  selector: 'app-chat-msg-topic-selection',
  templateUrl: './chat-msg-topic-selection.component.html',
  styleUrls: ['./chat-msg-topic-selection.component.less']
})
export class ChatMsgTopicSelectionComponent implements OnInit {

  @Input() params;
  @Input() content;

  responses: any = {};
  record: any = {};
  returnValue = new Subject<string>();
  submitted = false
  id = '';
  state: any = {choices: [], topics: {}, init: false};

  constructor(private backend: BackendService) { }

  ngOnInit(): void {
    this.id = this.params['topic-selection']['id'];
    this.record = this.params['__runner']['record'];
    this.responses = this.params['topic-selection']['responses'];
    
    // Get or set state
    this.record._topic_selection_state = this.record._topic_selection_state || {};
    this.record._topic_selection_state[this.id] = this.record._topic_selection_state[this.id] || this.state;
    this.state = this.record._topic_selection_state[this.id];

    if (!this.params.__runFast) {
      this.state.init = false;
    }

    if (!this.state.init) {
      this.state.choices = this.params['topic-selection']['choices'].filter(c => this.allowed(c));
      const topics = {};
      this.state.choices.forEach(c => topics[c.id] = !!c.default);
      this.state.topics = topics;
      this.state.init = true;
    }
    if (this.params.__runFast) {
      this.submit();
    }
  }

  toggle(choice) {
    if (!this.submitted) {
      this.state.topics[choice.id] = !this.state.topics[choice.id];
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
    const previous = !!(this.record.topics || {})[choice.id];
    console.log('TOP HAS', has, 'REQUIRES', requires, 'PREVIOUS', previous);
    return (!requires.business_kind || !!has.business_kind) && (!requires.location || !!has.location) && !previous;
  }

  enabled(choice) {
    return !!this.state.topics[choice.id];
  }

  wait() {
    return this.returnValue.toPromise();
  }

  selectedSome() {
    return !this.selectedAll() && !this.selectedNone();
  }

  selectedNone() {
    return this.state.choices.filter(c => this.state.topics[c.id]).length === 0;
  }

  selectedAll() {
    return this.state.choices.filter(c => this.state.topics[c.id]).length === this.state.choices.length;
  }

  submit() {
    if (!this.submitted) {
      const option = this.selectedAll() ? 'all' : (this.selectedNone() ? 'none' : 'some');
      const response = this.responses[option];
      this.record.topics = this.state.topics;
      this.record._topic_selection = option;
      this.returnValue.next(response.show);
      this.returnValue.complete();
      this.submitted = true;
      this.backend.update(this.record);
    }
  }
}
