import { first, Observable } from "rxjs";

export class ObservableQueue<T> {

    private queue: Observable<T>[] = [];

    private run() {
        if (this.queue.length > 0) {
          const obs = this.queue.shift();
          obs.pipe(first()).subscribe(() => {
              this.run();
          });
        }
    }

    public add(obs: Observable<T>): void {
        this.queue.push(obs);        
        if (this.queue.length === 1) {
          this.run();
        }
    }    
}