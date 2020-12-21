import { Component, OnInit } from '@angular/core';
import { DataService } from '../../data.service';
import { first } from 'rxjs/operators';

import * as marked from 'marked';

@Component({
  selector: 'app-widget-sidepage-privacy',
  templateUrl: './widget-sidepage-privacy.component.html',
  styleUrls: ['./widget-sidepage-privacy.component.less']
})
export class WidgetSidepagePrivacyComponent implements OnInit {

  content: any = {content: ''};
  marked = marked;

  constructor(private data: DataService) {
    this.data.content.pipe(first())
    .subscribe((content) => {
      this.content = content.privacy;
    });
  }

  ngOnInit(): void {
  }

}
