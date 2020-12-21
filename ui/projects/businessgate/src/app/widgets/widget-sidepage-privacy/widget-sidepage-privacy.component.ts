import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { DataService } from '../../data.service';

import * as marked from 'marked';

@Component({
  selector: 'app-widget-sidepage-privacy',
  templateUrl: './widget-sidepage-privacy.component.html',
  styleUrls: ['./widget-sidepage-privacy.component.less']
})
export class WidgetSidepagePrivacyComponent implements OnInit {

  content: Observable<any>;
  marked = marked;

  constructor(private data: DataService) {
    this.content = this.data.content;
  }

  ngOnInit(): void {
  }

}
