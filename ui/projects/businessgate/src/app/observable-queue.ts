import { first, Observable, tap, timer } from "rxjs";

export class ObservableQueue<T> {

    private queue: Observable<T>[] = [];
    private current: Observable<T> | null = null;

    constructor(private name: string) {
      this.name += '-' + Math.random();
    }

    private run() {
        if (this.queue.length > 0 && this.current === null) {
          this.current = this.queue.shift();
          // console.log(this.name, 'WAITING...', this.queue.length);
          this.current.pipe(
            tap(() => {
              // console.log(this.name, 'GOT RESULT', this.queue.length);
            }),
            first()
          ).subscribe(() => {
            this.current = null;
            // console.log(this.name, 'COMPLETED', this.queue.length);
            this.start();
          });
        }
    }

    private start() {
      timer(0).subscribe(() => this.run());
    }

    public add(obs: Observable<T>): void {
        this.queue.push(obs);
        // console.log(this.name, 'ADD TO QUEUE', this.queue.length);
        if (!this.current) {
          this.start();
        }
    }    
}