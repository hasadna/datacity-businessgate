import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import * as marked from 'marked';

@Component({
  selector: 'app-simple-card',
  templateUrl: './simple-card.component.html',
  styleUrls: ['./simple-card.component.less']
})
export class SimpleCardComponent implements OnChanges {

  @Input() width = 0;
  @Input() card;
  @Input() params;
  @Input() active;

  safeTitle: SafeHtml;
  safeContent: SafeHtml;

  constructor(private sanitizer: DomSanitizer) { }

  ngOnChanges(changes: SimpleChanges): void {
    console.log('SimpleCardComponent.ngOnChanges', this.card?.title, changes);
    this.safeTitle = this.params.__runner.fillIn(this.card.title || "EMPTY");
    this.safeContent = this.sanitizer.bypassSecurityTrustHtml(marked(this.params.__runner.fillIn(this.card.content || "EMPTY")));
  }
}
