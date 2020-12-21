import { Component, OnInit } from '@angular/core';
import { DataService } from '../../data.service';
import { first } from 'rxjs/operators';

import * as marked from 'marked';

@Component({
  selector: 'app-widget-sidepage-about',
  templateUrl: './widget-sidepage-about.component.html',
  styleUrls: ['./widget-sidepage-about.component.less']
})
export class WidgetSidepageAboutComponent implements OnInit {
  
  content: any = {content: '', credits: []};
  marked = marked;

  constructor(private data: DataService) {
    this.data.content.pipe(first())
    .subscribe((content) => {
      this.content = content.about;
    });
  }

  ngOnInit(): void {
  }

}
