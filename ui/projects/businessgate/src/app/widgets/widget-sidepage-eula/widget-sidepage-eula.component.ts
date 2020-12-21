import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { DataService } from '../../data.service';

import * as marked from 'marked';

@Component({
  selector: 'app-widget-sidepage-eula',
  templateUrl: './widget-sidepage-eula.component.html',
  styleUrls: ['./widget-sidepage-eula.component.less']
})
export class WidgetSidepageEulaComponent implements OnInit {

  content: Observable<any>;
  marked = marked;

  constructor(private data: DataService) {
    this.content = this.data.content;
  }

  ngOnInit(): void {
  }

}
