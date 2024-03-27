import { Component, OnInit } from '@angular/core';
import { DataService } from '../../data.service';
import { first } from 'rxjs/operators';

import * as marked from 'marked';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-widget-sidepage-eula',
  templateUrl: './widget-sidepage-eula.component.html',
  styleUrls: ['./widget-sidepage-eula.component.less']
})
export class WidgetSidepageEulaComponent implements OnInit {

  content: any = {content: ''};
  safeContent: SafeHtml;

  constructor(private data: DataService, private sanitizer: DomSanitizer) {
    this.data.content.pipe(first())
    .subscribe((content) => {
      this.content = content.eula;
      this.safeContent = sanitizer.bypassSecurityTrustHtml(marked(this.content.content));
    });
  }


  ngOnInit(): void {
  }

}
