import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-base-card',
  templateUrl: './base-card.component.html',
  styleUrls: ['./base-card.component.less']
})
export class BaseCardComponent implements OnInit {

  @Input() width = 0;
  @Input() shadow = true;
  @Input() active = true;

  constructor() { }

  ngOnInit(): void {
  }

}
