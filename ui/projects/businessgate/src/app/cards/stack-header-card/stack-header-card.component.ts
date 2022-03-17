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
    'translateY(5px)matrix(1, 0.03, -0.04, 1, 0, 0)',
    'translateY(5px)matrix(1, -0.03, 0.04, 1, 0, 0)',
    'translateY(5px)matrix(1, -0.05, 0.05, 1, 0, 0)',
    'translateY(5px)matrix(1, 0.05, -0.05, 1, 0, 0)',
    'translateY(5px)matrix(1, -0.03, 0.04, 1, 0, 0)',
  ];

  ngOnInit(): void {
  }

}
