import { Component, OnInit } from '@angular/core';
import { DataService } from '../../data.service';
import { first } from 'rxjs/operators';

import * as marked from 'marked';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-widget-sidepage-about',
  templateUrl: './widget-sidepage-about.component.html',
  styleUrls: ['./widget-sidepage-about.component.less']
})
export class WidgetSidepageAboutComponent implements OnInit {
  
  content: any = {content: '', credits: []};
  safeContent: SafeHtml;

  constructor(private data: DataService, private sanitizer: DomSanitizer) {
    this.data.content.pipe(first())
    .subscribe((content) => {
      this.content = content.about;
      this.safeContent = sanitizer.bypassSecurityTrustHtml(marked(this.content.content));
    });
  }

  ngOnInit(): void {
  }

}
