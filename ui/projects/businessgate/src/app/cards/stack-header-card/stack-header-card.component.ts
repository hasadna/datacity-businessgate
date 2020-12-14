import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-stack-header-card',
  templateUrl: './stack-header-card.component.html',
  styleUrls: ['./stack-header-card.component.less']
})
export class StackHeaderCardComponent implements OnInit {

  constructor() { }

  @Input() width = 120;
  @Input() stack;
  @Input() params;

  transforms = [
    'rotate(5deg)',
    'rotate(-3deg)',
    'rotate(10deg)',
    'rotate(-7deg)',
    'rotate(2deg)',
  ];

  ngOnInit(): void {
  }

}
