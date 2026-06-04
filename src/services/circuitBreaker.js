const STATE = { CLOSED: "closed", OPEN: "open", HALF_OPEN: "half_open" };

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 30000;
    this.state = STATE.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.lastError = null;
  }

  async call(fn) {
    if (this.state === STATE.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.timeout) {
        this.state = STATE.HALF_OPEN;
        console.log(`[CircuitBreaker] Chuyển sang HALF_OPEN — thử lại...`);
      } else {
        throw new Error(`Circuit breaker OPEN — từ chối request (còn ${Math.round((this.timeout - (Date.now() - this.lastFailureTime)) / 1000)}s)`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  onSuccess() {
    if (this.state === STATE.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.reset();
        console.log(`[CircuitBreaker] ✅ Phục hồi — chuyển sang CLOSED`);
      }
    } else {
      this.reset();
    }
  }

  onFailure(err) {
    this.lastError = err;
    this.lastFailureTime = Date.now();
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.failureThreshold) {
      this.state = STATE.OPEN;
      console.log(`[CircuitBreaker] ⚠️ Chuyển sang OPEN — ${this.failureCount} lỗi liên tiếp. Chờ ${this.timeout / 1000}s`);
    }
  }

  reset() {
    this.state = STATE.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastError: this.lastError?.message || null,
    };
  }
}

const commentBreaker = new CircuitBreaker({ failureThreshold: 5, timeout: 30000 });

module.exports = { CircuitBreaker, commentBreaker };
