import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

@Injectable()
export class AlertsStreamService {
  private streams = new Map<number, Set<Subject<MessageEvent>>>();

  subscribe(assistedUserID: number): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    let set = this.streams.get(assistedUserID);
    if (!set) {
      set = new Set();
      this.streams.set(assistedUserID, set);
    }
    set.add(subject);

    return new Observable<MessageEvent>((observer) => {
      const sub = subject.subscribe(observer);
      return () => {
        sub.unsubscribe();
        set!.delete(subject);
        if (set!.size === 0) this.streams.delete(assistedUserID);
      };
    });
  }

  publish(assistedUserID: number, alert: object) {
    const set = this.streams.get(assistedUserID);
    if (!set) return;
    const event: MessageEvent = { data: alert };
    set.forEach((subject) => subject.next(event));
  }
}
