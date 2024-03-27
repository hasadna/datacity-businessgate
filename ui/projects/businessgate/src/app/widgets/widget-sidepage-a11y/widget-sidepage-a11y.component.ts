import { Component, OnInit } from '@angular/core';
import { DataService } from '../../data.service';
import { first } from 'rxjs/operators';

import * as marked from 'marked';
import { DomSanitizer } from '@angular/platform-browser';

@Component({
  selector: 'app-widget-sidepage-a11y',
  templateUrl: './widget-sidepage-a11y.component.html',
  styleUrls: ['./widget-sidepage-a11y.component.less']
})
export class WidgetSidepageA11yComponent implements OnInit {

  content: any = {content: ''};
  safeContent: any;

  constructor(private data: DataService, private sanitizer: DomSanitizer) {
    this.data.content.pipe(first())
    .subscribe((content) => {
      this.content = content.a11y;
      this.safeContent = this.sanitizer.bypassSecurityTrustHtml(marked(this.content.content));
    });
  }


  ngOnInit(): void {
  }

}
