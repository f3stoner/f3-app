/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/data/seedMembers.js"
/*!*********************************!*\
  !*** ./src/data/seedMembers.js ***!
  \*********************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   seedMembers: () => (/* binding */ seedMembers)\n/* harmony export */ });\nconst seedMembers = [\n    {\n        id: \"p1\",\n        paxName: \"Stoner\",\n        invitedById: null,\n        status: \"active\",\n        firstPostDate: null,\n    },\n    {\n        id: \"p2\",\n        paxName: \"Rocket Power\",\n        invitedById: null,\n        status: \"active\",\n        firstPostDate: null,\n    },\n    {\n        id: \"p3\",\n        paxName: \"Sticks\",\n        invitedById: \"p2\",\n        status: \"active\",\n        firstPostDate: \"2025-10-04\",\n    }\n]\n\n//# sourceURL=webpack://f3-app/./src/data/seedMembers.js?\n}");

/***/ },

/***/ "./src/index.js"
/*!**********************!*\
  !*** ./src/index.js ***!
  \**********************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var _modules_state_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./modules/state.js */ \"./src/modules/state.js\");\n/* harmony import */ var _views_rosterView_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./views/rosterView.js */ \"./src/views/rosterView.js\");\n\n\n\n(0,_views_rosterView_js__WEBPACK_IMPORTED_MODULE_1__.renderRoster)();\n\n//# sourceURL=webpack://f3-app/./src/index.js?\n}");

/***/ },

/***/ "./src/modules/state.js"
/*!******************************!*\
  !*** ./src/modules/state.js ***!
  \******************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   state: () => (/* binding */ state)\n/* harmony export */ });\n/* harmony import */ var _data_seedMembers_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../data/seedMembers.js */ \"./src/data/seedMembers.js\");\n\n\nconst state = {\n    members: [..._data_seedMembers_js__WEBPACK_IMPORTED_MODULE_0__.seedMembers],\n    sessions: [],\n    currentView: \"dashboard\",\n};\n\n//# sourceURL=webpack://f3-app/./src/modules/state.js?\n}");

/***/ },

/***/ "./src/views/rosterView.js"
/*!*********************************!*\
  !*** ./src/views/rosterView.js ***!
  \*********************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   renderRoster: () => (/* binding */ renderRoster)\n/* harmony export */ });\n/* harmony import */ var _modules_state_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../modules/state.js */ \"./src/modules/state.js\");\n\n\nfunction renderRoster() {\n  const app = document.getElementById(\"app\");\n\n  app.innerHTML = `\n    <h1>Roster</h1>\n    <ul>\n      ${_modules_state_js__WEBPACK_IMPORTED_MODULE_0__.state.members.map(member => `<li>${member.paxName}</li>`).join(\"\")}\n    </ul>\n  `;\n}\n\n//# sourceURL=webpack://f3-app/./src/views/rosterView.js?\n}");

/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		if (!(moduleId in __webpack_modules__)) {
/******/ 			delete __webpack_module_cache__[moduleId];
/******/ 			var e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = __webpack_require__("./src/index.js");
/******/ 	
/******/ })()
;