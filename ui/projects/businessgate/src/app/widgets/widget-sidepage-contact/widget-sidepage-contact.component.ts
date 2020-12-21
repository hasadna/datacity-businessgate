import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { DataService } from '../../data.service';

import * as marked from 'marked';

@Component({
  selector: 'app-widget-sidepage-contact',
  templateUrl: './widget-sidepage-contact.component.html',
  styleUrls: ['./widget-sidepage-contact.component.less']
})
export class WidgetSidepageContactComponent implements OnInit {

  content: Observable<any>;
  marked = marked;

  constructor(private data: DataService) {
    this.content = this.data.content;
  }

  ngOnInit(): void {
  }

}
