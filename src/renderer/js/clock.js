/*
 * clock.js - sumber waktu widget.
 *
 * Tiga mode:
 *   live   : ikut jam sistem (opsional digeser ke zona waktu lain)
 *   manual : jam ditentukan pengguna lewat penggeser (pengubah waktu)
 *   demo   : satu hari penuh diputar cepat, untuk melihat peralihan
 *            pagi -> siang -> sore -> malam berjalan mulus
 */
(function (root) {
  'use strict';
  root.PDC = root.PDC || {};

  var DAYS = ['MIN', 'SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB'];
  var MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN',
                'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function Clock() {
    this.mode = 'live';
    this.tzOffsetMin = null;     // null = ikut sistem
    this.manualHour = 12;        // 0..24 (pecahan)
    this.demoHour = 6;
    this.demoDayPerSec = 1 / 60; // 1 hari per 60 detik
    this._demoDate = new Date();
  }

  Clock.prototype.update = function (dt) {
    if (this.mode === 'demo') {
      this.demoHour += dt * 24 * this.demoDayPerSec;
      while (this.demoHour >= 24) this.demoHour -= 24;
    }
  };

  /** Komponen waktu mentah sesuai mode & zona waktu. */
  Clock.prototype.parts = function () {
    var d, h, m, s, dow, day, mon, year;
    if (this.mode === 'live') {
      if (this.tzOffsetMin == null) {
        d = new Date();
        h = d.getHours(); m = d.getMinutes(); s = d.getSeconds();
        dow = d.getDay(); day = d.getDate(); mon = d.getMonth(); year = d.getFullYear();
      } else {
        d = new Date(Date.now() + this.tzOffsetMin * 60000);
        h = d.getUTCHours(); m = d.getUTCMinutes(); s = d.getUTCSeconds();
        dow = d.getUTCDay(); day = d.getUTCDate(); mon = d.getUTCMonth(); year = d.getUTCFullYear();
      }
    } else {
      var hf = this.mode === 'demo' ? this.demoHour : this.manualHour;
      hf = ((hf % 24) + 24) % 24;
      h = Math.floor(hf);
      var mf = (hf - h) * 60;
      m = Math.floor(mf);
      s = Math.floor((mf - m) * 60);
      d = new Date();
      dow = d.getDay(); day = d.getDate(); mon = d.getMonth(); year = d.getFullYear();
    }
    return { h: h, m: m, s: s, dow: dow, day: day, mon: mon, year: year };
  };

  /** Jam desimal 0..24 yang menggerakkan pencahayaan pemandangan. */
  Clock.prototype.sceneHour = function (p) {
    p = p || this.parts();
    return p.h + p.m / 60 + p.s / 3600;
  };

  /** Rangkai semua teks untuk HUD. */
  Clock.prototype.info = function (opt) {
    var p = this.parts();
    var h24 = p.h;
    var h = h24, ampm = '';
    if (opt.hour12) {
      ampm = h24 < 12 ? 'AM' : 'PM';
      h = h24 % 12; if (h === 0) h = 12;
    }
    var timeText = (opt.hour12 ? '' + h : pad2(h)) + ':' + pad2(p.m);
    var badge = this.mode === 'manual' ? 'MANUAL'
      : this.mode === 'demo' ? 'DEMO 1 HARI' : '';
    if (this.mode === 'live' && this.tzOffsetMin != null) {
      var sign = this.tzOffsetMin < 0 ? '-' : '+';
      var abs = Math.abs(this.tzOffsetMin);
      badge = 'UTC' + sign + pad2(Math.floor(abs / 60)) + ':' + pad2(abs % 60);
    }
    return {
      time: timeText,
      sec: opt.showSeconds ? pad2(p.s) : '',
      ampm: ampm,
      date: opt.showDate ? (DAYS[p.dow] + ' ' + p.day + ' ' + MONTHS[p.mon]) : '',
      phase: opt.showPhase ? root.PDC.palette.phaseLabel(this.sceneHour(p)) : '',
      badge: opt.showBadge === false ? '' : badge,
      hour: this.sceneHour(p),
      parts: p
    };
  };

  root.PDC.Clock = Clock;
  root.PDC.DAYS = DAYS;
  root.PDC.MONTHS = MONTHS;
})(typeof self !== 'undefined' ? self : this);
