import { Component, Input, OnChanges, OnInit } from '@angular/core';

@Component({
  selector: 'app-owner-profile-photo',
  templateUrl: './owner-profile-photo.component.html',
  styleUrls: ['./owner-profile-photo.component.less']
})
export class OwnerProfilePhotoComponent implements OnChanges {

  @Input() size = 24;
  @Input() borderWidth: 2;
  @Input() borderColor: '#2C3C3B;';
  @Input() owner: any;

  style = '';
  initials = '';

  constructor() { }

  ngOnChanges(): void {
    this.style = `
      height: ${this.size}px;
      width: ${this.size}px;
      border-radius: ${this.size/2}px;
      border-width: ${this.borderWidth}px;
      border-color: ${this.borderColor};
      background-color: ${this.borderColor};
      font-size: ${this.size*0.75}px;
    `;
    this.initials = '';
    if (this.owner.name) {
      for (const part of this.owner.name.split(' ')) {
        this.initials += part[0];
        if (this.initials.length === 2) {
          break;
        }
      }  
    }
  }
}
