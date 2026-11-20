interface Member {
  close: () => void;
  id: string;
  scope: string;
}

// Coordinate registry tooltips across stable Base UI provider scopes. Native providers
// still own interactions; their wrappers must not appear/disappear around user content.
export class TooltipHoverGroup {
  private active: Member | undefined;
  private warm = false;
  private disposed = false;
  private timeout = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<() => void>();

  readonly getSnapshot = () => this.warm;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private setWarm(warm: boolean) {
    if (this.warm === warm) {
      return;
    }
    this.warm = warm;
    for (const listener of this.listeners) {
      listener();
    }
  }

  open(member: Member) {
    // Mounted members can register before their provider's layout setup in StrictMode replay.
    this.activate();
    clearTimeout(this.timer);
    const previous = this.active;
    this.active = member;
    this.setWarm(true);
    if (previous !== undefined && previous.id !== member.id && previous.scope !== member.scope) {
      previous.close();
    }
  }

  configure(timeout: number) {
    if (this.disposed || this.timeout === timeout) {
      return;
    }
    this.timeout = timeout;
    if (this.active === undefined && this.warm) {
      this.releaseWarmth();
    }
  }

  private releaseWarmth() {
    clearTimeout(this.timer);
    if (this.timeout > 0 && this.listeners.size > 0) {
      this.timer = setTimeout(() => {
        this.setWarm(false);
      }, this.timeout);
    } else {
      this.setWarm(false);
    }
  }

  close(id: string) {
    if (this.disposed || this.active?.id !== id) {
      return;
    }
    this.active = undefined;
    this.releaseWarmth();
  }

  activate() {
    this.disposed = false;
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.active = undefined;
    this.warm = false;
  }
}
