import { Component, OnInit } from '@angular/core';
import { DataService } from '../../data.service';
import { first } from 'rxjs/operators';

import * as marked from 'marked';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-widget-sidepage-privacy',
  templateUrl: './widget-sidepage-privacy.component.html',
  styleUrls: ['./widget-sidepage-privacy.component.less']
})
export class WidgetSidepagePrivacyComponent implements OnInit {

  content: any = {content: ''};
  safeContent: SafeHtml;

  constructor(private data: DataService, private sanitizer: DomSanitizer) {
    this.data.content.pipe(first())
    .subscribe((content) => {
      this.content = content.privacy;
      this.safeContent = sanitizer.bypassSecurityTrustHtml(marked(this.content.content));
    });
  }

  ngOnInit(): void {
  }

}
