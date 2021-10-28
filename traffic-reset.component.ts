import { Component, OnInit, OnDestroy } from '@angular/core';
import { ShareService} from '../../../core/services/share.service';
import { UrlService } from '../../../core/services/url.service';
import { TrafficResetResponse, TrafficResetServiceDetails, Operator } from '../../../core/models/all';
import { Observable, SubscriptionLike, timer } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { map, mergeMap, concatMap } from 'rxjs/operators';

@Component({
  selector: 'app-traffic-reset',
  templateUrl: './traffic-reset.component.html',
  styleUrls: ['./traffic-reset.component.css']
})
export class TrafficResetComponent implements OnInit, OnDestroy {
  public loading: boolean;
  public error: boolean;
  public loggedIn: boolean;
  public isOperatorUser: boolean;
  public noSubOrExpired: boolean;
  public subIsWaitingForTariffication: boolean;
  public subIsActive: boolean;
  public subIsInHold: boolean;
  public subTarifficationError: boolean;
  public checked: boolean;
  public operatorError: boolean;
  public service: TrafficResetServiceDetails;

  private subscription: SubscriptionLike;
  private createSubscriptionSub: SubscriptionLike;

  constructor(
    private share: ShareService,
    private urlService: UrlService,
    private http: HttpClient,
  ) {}

  ngOnInit(): void {
    this.initFields();
    this.checkAuth();
    if (this.loggedIn) {
      this.subscription = this.initSubs()
        .subscribe(() => {
          if (this.subIsActive || this.subIsInHold || this.subTarifficationError || this.noSubOrExpired) {
            this.unsub();
          }
        });
    }
  }

  private initFields() {
    this.loading = false;
    this.loggedIn = false;
    this.error = false;
    this.operatorError = false;
    this.service = {
      name: 'Traffic Reset',
      price: 100,
      duration: '7 days'
    };
  }

  private checkAuth() {
    this.loggedIn = this.share.getCookie('mobile_phone') !== undefined;
  }

  private initSubs() {
    return this.checkOperatorRequest()
      .pipe(
        map((response: Operator) => this.checkOperator(response)),
        mergeMap((response: boolean) => this.checkLastSubscription(response))
      );
  }

  private checkOperatorRequest(): Observable<Operator> {
    return this.http.get<Operator>(`${this.urlService.getUrl()}operator`);
  }

  private checkOperator(response: Operator) {
    if (response.status === 'success' && response.operator === 'someOperator') {
      this.isOperatorUser = true;
      this.operatorError = false;
    } else if (response.status === 'success' && response.operator !== 'someOperator') {
      this.isOperatorUser = false;
      this.operatorError = false;
    } else {
      this.operatorError = true;
    }
    return this.isOperatorUser;
  }

  private checkLastSubscriptionRequest(): Observable<TrafficResetResponse> {
    return this.http.get<TrafficResetResponse>(`${this.urlService.getUrl()}trafficreset/subscriptions/last`);
  }

  private checkLastSubscription(response: boolean) {
    if (response) {
      return timer(0, 10000)
        .pipe(
          concatMap(() => this.checkLastSubscriptionRequest()),
          map((res: TrafficResetResponse) => {
            this.noSubOrExpired = res.data === null || res.data.state === 'DISCONNECTED_BY_SUBSCRIPTION_EXPIRED';
            if (!this.noSubOrExpired) {
              this.checkActiveSubscription(res);
            }
          })
        );
    }
  }

  private createSubscriptionRequest(): Observable<TrafficResetResponse> {
    return this.http.post<TrafficResetResponse>(`${this.urlService.getUrl()}trafficreset/subscriptions`, null);
  }

  private checkActiveSubscription(response: TrafficResetResponse) {
    this.loading = false;
    this.error = false;
    this.subIsWaitingForTariffication = false;
    this.subIsActive = false;
    this.subIsInHold = false;
    this.subTarifficationError = false;
    if (response.data.state === 'REQUESTED_FOR_CREATION' || response.data.state === 'WAITING_FOR_TARIFFICATION') {
      this.subIsWaitingForTariffication = true;
    } else if (response.data.state === 'ACTIVE') {
      this.subIsActive = true;
    } else if (response.data.state === 'DISCONNECTED_BY_SUBSCRIBER_ON_HOLD') {
      this.subIsInHold = true;
    } else if (response.data.state === 'DISCONNECTED_BY_TARIFFICATION_ERROR') {
      this.subTarifficationError = true;
    }
  }

  private goToLogin() {
    location.href =
      'https://operator.com/Login?service=login&sms=forced&goto=' +
      encodeURI(this.urlService.getUrlForCallback() + '/login?realgo=' + btoa(location.href));
  }

  public openLink() {
    if (!this.loggedIn || (this.loggedIn && this.operatorError)) {
      this.checked = !this.checked;
      this.goToLogin();
    }
    if (this.loggedIn && !this.isOperatorUser && !this.operatorError) {
      window.open('https://operator.com/personal');
    }
    if (this.loggedIn && this.isOperatorUser && (this.noSubOrExpired || this.subIsInHold || this.subTarifficationError)) {
      this.loading = true;
      this.createSubscriptionSub = this.createSubscriptionRequest()
        .pipe(
          mergeMap((response: TrafficResetResponse) => this.checkLastSubscription(response.success))
        )
        .subscribe(
          () => {
            if (this.subIsActive || this.subIsInHold || this.subTarifficationError) {
              this.unsub();
            }
          },
          () => {
            this.loading = false;
            this.error = true;
          }
        );
    }
    if (this.loggedIn && this.isOperatorUser && this.subIsActive) {
      window.open('https://operator.com/');
      this.checked = !this.checked;
    }
  }

  private unsub() {
    if (this.subscription) {
      this.subscription .unsubscribe();
    }
    if (this.createSubscriptionSub) {
      this.createSubscriptionSub.unsubscribe();
    }
  }

  ngOnDestroy() {
    this.unsub();
  }
}
