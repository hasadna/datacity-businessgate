import { Injectable } from '@angular/core';
import { ReplaySubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MainScrollService {

  scrollPosition = new ReplaySubject<number>(1);

  constructor() { }
}
