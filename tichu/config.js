/* 잠만보 티츄 설정 — 운영(jammanbo)·테스트(jammanbo-beta) 모두 이 파일을 그대로 씁니다.
 * 환경(prod/beta/local)은 상위 폴더의 ../config.js(잠만보 설정)가 주소를 보고 정합니다.
 *
 *  TICHU_API_PROD : 티츄 Apps Script → 배포 관리 → '운영' 배포의 웹 앱 URL
 *  TICHU_API_BETA : 같은 프로젝트의 '테스트' 배포 URL (비우면 PROD 를 씀)
 *  비밀 값은 넣지 마세요 (토큰 서명 키는 Apps Script 스크립트 속성에만 있음)
 */
var TICHU_API_PROD = 'https://script.google.com/macros/s/AKfycbzMLG2RxrxIlhT3aTYARhxGyfzINky2HGRlEmYIsku4EegWU8YDWHDSh_FXLPy6Ac4alQ/exec';
// 실시간 서버 (3_서버_AppsScript/tichu_rt — Cloudflare): 로비·방 만들기·게임. 비우면 전부 GAS (되돌릴 때)
var TICHU_RT_PROD = 'https://tichu-rt-prod.dlwjd.workers.dev';
var TICHU_RT_BETA = 'https://tichu-rt-beta.dlwjd.workers.dev';
var TICHU_API_BETA ='https://script.google.com/macros/s/AKfycbwkad_b4Z1NxUu0lFshQFX-ngzSOf3zjpBP3DZylXF2dDctVAVDgq_vyTG8GvxtVCJWyw/exec';

(function () {
  var main = window.JMB_CONFIG || {};
  var env = main.env || (!/github\.io$/.test(location.hostname) ? 'local' : /^\/jammanbo\//.test(location.pathname) ? 'prod' : 'beta');
  var api = env === 'prod' || !TICHU_API_BETA ? TICHU_API_PROD : TICHU_API_BETA;
  if (env === 'local' && window.TICHU_API_LOCAL) api = window.TICHU_API_LOCAL;
  window.TICHU_CONFIG = {
    version: '1.0.0',
    env: env,
    api: api,
    rt: env === 'prod' ? TICHU_RT_PROD : TICHU_RT_BETA,
    kakaoRestKey: main.kakaoRestKey || '',
    mainApi: main.api || ''
  };
})();
