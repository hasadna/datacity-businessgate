import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { DataService } from '../../data.service';

import * as marked from 'marked';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-widget-sidepage-about',
  templateUrl: './widget-sidepage-about.component.html',
  styleUrls: ['./widget-sidepage-about.component.less']
})
export class WidgetSidepageAboutComponent implements OnInit {
  
  content: Observable<any>;
  marked = marked;

  constructor(private data: DataService) {
    this.content = this.data.content.pipe(
      map((content) => content.about)
    );
  }

  ngOnInit(): void {
  }

}
