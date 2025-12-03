"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fillAdvancedBundleForm = exports.verifyBrokerStatus = exports.goToBundleProgress = exports.isBundleGenerationInProgress = exports.deleteDebugBundle = exports.downloadDebugBundle = exports.cancelBundleGeneration = exports.waitForBundleCompletion = exports.switchToAdvancedMode = exports.createBasicDebugBundle = exports.goToDebugBundle = void 0;
var test_1 = require("@playwright/test");
/**
 * Navigates to the debug bundle creation page
 */
var goToDebugBundle = function (page) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, test_1.test.step('Navigate to debug bundle page', function () { return __awaiter(void 0, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, page.goto('/debug-bundle')];
                            case 1:
                                _a.sent();
                                return [4 /*yield*/, (0, test_1.expect)(page.getByRole('heading', { name: /debug bundle/i })).toBeVisible()];
                            case 2:
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                }); })];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); };
exports.goToDebugBundle = goToDebugBundle;
/**
 * Creates a basic debug bundle with default settings
 */
var createBasicDebugBundle = function (page) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, test_1.test.step('Create basic debug bundle', function () { return __awaiter(void 0, void 0, void 0, function () {
                    var generateButton;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, page.goto('/debug-bundle')];
                            case 1:
                                _a.sent();
                                generateButton = page.getByRole('button', { name: /generate/i }).first();
                                return [4 /*yield*/, (0, test_1.expect)(generateButton).toBeVisible()];
                            case 2:
                                _a.sent();
                                return [4 /*yield*/, generateButton.click()];
                            case 3:
                                _a.sent();
                                // Wait for navigation to progress page
                                return [4 /*yield*/, page.waitForURL(/\/debug-bundle\/progress\//)];
                            case 4:
                                // Wait for navigation to progress page
                                _a.sent();
                                return [4 /*yield*/, (0, test_1.expect)(page.getByText(/generating/i)).toBeVisible({ timeout: 10000 })];
                            case 5:
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                }); })];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); };
exports.createBasicDebugBundle = createBasicDebugBundle;
/**
 * Switches to advanced form mode
 */
var switchToAdvancedMode = function (page) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, test_1.test.step('Switch to advanced form mode', function () { return __awaiter(void 0, void 0, void 0, function () {
                    var advancedButton;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, page.goto('/debug-bundle')];
                            case 1:
                                _a.sent();
                                advancedButton = page.getByRole('button', { name: /advanced/i });
                                return [4 /*yield*/, (0, test_1.expect)(advancedButton).toBeVisible()];
                            case 2:
                                _a.sent();
                                return [4 /*yield*/, advancedButton.click()];
                            case 3:
                                _a.sent();
                                // Verify advanced options are visible
                                return [4 /*yield*/, (0, test_1.expect)(page.getByText(/cpu profiler/i)).toBeVisible()];
                            case 4:
                                // Verify advanced options are visible
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                }); })];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); };
exports.switchToAdvancedMode = switchToAdvancedMode;
/**
 * Waits for debug bundle generation to complete or fail
 * @param page Playwright page
 * @param timeout Maximum time to wait in ms (default 60s)
 */
var waitForBundleCompletion = function (page_1) {
    var args_1 = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args_1[_i - 1] = arguments[_i];
    }
    return __awaiter(void 0, __spreadArray([page_1], args_1, true), void 0, function (page, timeout) {
        if (timeout === void 0) { timeout = 60000; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, test_1.test.step('Wait for bundle generation to complete', function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: 
                                // Wait for either success message, download link, or error
                                return [4 /*yield*/, Promise.race([
                                        page.getByText(/complete|success|ready/i).waitFor({ timeout: timeout }),
                                        page.getByText(/download/i).waitFor({ timeout: timeout }),
                                        page.getByText(/error|failed/i).waitFor({ timeout: timeout }),
                                    ])];
                                case 1:
                                    // Wait for either success message, download link, or error
                                    _a.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
};
exports.waitForBundleCompletion = waitForBundleCompletion;
/**
 * Cancels an in-progress bundle generation
 */
var cancelBundleGeneration = function (page) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, test_1.test.step('Cancel bundle generation', function () { return __awaiter(void 0, void 0, void 0, function () {
                    var stopButton, confirmButton;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                stopButton = page.getByRole('button', { name: /stop|cancel/i });
                                return [4 /*yield*/, (0, test_1.expect)(stopButton).toBeVisible()];
                            case 1:
                                _a.sent();
                                return [4 /*yield*/, stopButton.click()];
                            case 2:
                                _a.sent();
                                confirmButton = page.getByRole('button', { name: /confirm|yes|stop/i });
                                return [4 /*yield*/, confirmButton.isVisible({ timeout: 2000 }).catch(function () { return false; })];
                            case 3:
                                if (!_a.sent()) return [3 /*break*/, 5];
                                return [4 /*yield*/, confirmButton.click()];
                            case 4:
                                _a.sent();
                                _a.label = 5;
                            case 5: 
                            // Wait for cancellation to be processed
                            return [4 /*yield*/, page.waitForTimeout(1000)];
                            case 6:
                                // Wait for cancellation to be processed
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                }); })];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); };
exports.cancelBundleGeneration = cancelBundleGeneration;
/**
 * Downloads the generated debug bundle
 */
var downloadDebugBundle = function (page) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, test_1.test.step('Download debug bundle', function () { return __awaiter(void 0, void 0, void 0, function () {
                    var downloadLink, downloadPromise, download;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                downloadLink = page.getByRole('link', { name: /download/i });
                                return [4 /*yield*/, (0, test_1.expect)(downloadLink).toBeVisible({ timeout: 5000 })];
                            case 1:
                                _a.sent();
                                downloadPromise = page.waitForEvent('download');
                                return [4 /*yield*/, downloadLink.click()];
                            case 2:
                                _a.sent();
                                return [4 /*yield*/, downloadPromise];
                            case 3:
                                download = _a.sent();
                                (0, test_1.expect)(download.suggestedFilename()).toMatch(/debug-bundle\.zip/);
                                return [2 /*return*/, download];
                        }
                    });
                }); })];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); };
exports.downloadDebugBundle = downloadDebugBundle;
/**
 * Deletes the debug bundle file
 */
var deleteDebugBundle = function (page) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, test_1.test.step('Delete debug bundle', function () { return __awaiter(void 0, void 0, void 0, function () {
                    var deleteButton, confirmButton;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                deleteButton = page.getByRole('button', { name: /delete/i }).or(page.locator('button[aria-label*="delete"]'));
                                return [4 /*yield*/, (0, test_1.expect)(deleteButton).toBeVisible()];
                            case 1:
                                _a.sent();
                                return [4 /*yield*/, deleteButton.click()];
                            case 2:
                                _a.sent();
                                confirmButton = page.getByRole('button', { name: /confirm|yes|delete/i });
                                return [4 /*yield*/, confirmButton.isVisible({ timeout: 2000 }).catch(function () { return false; })];
                            case 3:
                                if (!_a.sent()) return [3 /*break*/, 5];
                                return [4 /*yield*/, confirmButton.click()];
                            case 4:
                                _a.sent();
                                _a.label = 5;
                            case 5: 
                            // Wait for deletion to complete
                            return [4 /*yield*/, (0, test_1.expect)(page.getByText(/deleted|removed/i)).toBeVisible({ timeout: 5000 })];
                            case 6:
                                // Wait for deletion to complete
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                }); })];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); };
exports.deleteDebugBundle = deleteDebugBundle;
/**
 * Checks if debug bundle generation is in progress
 */
var isBundleGenerationInProgress = function (page) { return __awaiter(void 0, void 0, void 0, function () {
    var progressLink;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, page.goto('/debug-bundle')];
            case 1:
                _a.sent();
                progressLink = page.getByRole('link', { name: /progress|in progress/i });
                return [2 /*return*/, progressLink.isVisible({ timeout: 2000 }).catch(function () { return false; })];
        }
    });
}); };
exports.isBundleGenerationInProgress = isBundleGenerationInProgress;
/**
 * Navigates to bundle generation progress page if one exists
 */
var goToBundleProgress = function (page) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, test_1.test.step('Navigate to bundle progress', function () { return __awaiter(void 0, void 0, void 0, function () {
                    var progressLink;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, page.goto('/debug-bundle')];
                            case 1:
                                _a.sent();
                                progressLink = page.getByRole('link', { name: /progress|view progress|in progress/i });
                                return [4 /*yield*/, (0, test_1.expect)(progressLink).toBeVisible()];
                            case 2:
                                _a.sent();
                                return [4 /*yield*/, progressLink.click()];
                            case 3:
                                _a.sent();
                                return [4 /*yield*/, (0, test_1.expect)(page).toHaveURL(/\/debug-bundle\/progress\//)];
                            case 4:
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                }); })];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); };
exports.goToBundleProgress = goToBundleProgress;
/**
 * Verifies broker status display on progress page
 */
var verifyBrokerStatus = function (page) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, test_1.test.step('Verify broker status display', function () { return __awaiter(void 0, void 0, void 0, function () {
                    var brokerStatus;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: 
                            // Should be on progress page
                            return [4 /*yield*/, (0, test_1.expect)(page).toHaveURL(/\/debug-bundle\/progress\//)];
                            case 1:
                                // Should be on progress page
                                _a.sent();
                                brokerStatus = page.locator('[role="listitem"]').or(page.locator('[role="row"]'));
                                return [4 /*yield*/, (0, test_1.expect)(brokerStatus.first()).toBeVisible({ timeout: 5000 })];
                            case 2:
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                }); })];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); };
exports.verifyBrokerStatus = verifyBrokerStatus;
/**
 * Fills advanced debug bundle form with custom options
 */
var fillAdvancedBundleForm = function (page, options) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, test_1.test.step('Fill advanced bundle form', function () { return __awaiter(void 0, void 0, void 0, function () {
                    var cpuInput, logSizeInput, logsLimitInput, metricsInput, tlsCheckbox;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, (0, exports.switchToAdvancedMode)(page)];
                            case 1:
                                _a.sent();
                                if (!(options.cpuProfilerSeconds !== undefined)) return [3 /*break*/, 3];
                                cpuInput = page.getByLabel(/cpu profiler/i).or(page.locator('input[data-testid*="cpu-profiler"]'));
                                return [4 /*yield*/, cpuInput.fill(String(options.cpuProfilerSeconds))];
                            case 2:
                                _a.sent();
                                _a.label = 3;
                            case 3:
                                if (!(options.controllerLogSizeMB !== undefined)) return [3 /*break*/, 5];
                                logSizeInput = page
                                    .getByLabel(/controller log.*size/i)
                                    .or(page.locator('input[data-testid*="controller-log-size"]'));
                                return [4 /*yield*/, logSizeInput.fill(String(options.controllerLogSizeMB))];
                            case 4:
                                _a.sent();
                                _a.label = 5;
                            case 5:
                                if (!(options.logsSizeLimitMB !== undefined)) return [3 /*break*/, 7];
                                logsLimitInput = page
                                    .getByLabel(/logs.*size.*limit/i)
                                    .or(page.locator('input[data-testid*="logs-size-limit"]'));
                                return [4 /*yield*/, logsLimitInput.fill(String(options.logsSizeLimitMB))];
                            case 6:
                                _a.sent();
                                _a.label = 7;
                            case 7:
                                if (!(options.metricsIntervalSeconds !== undefined)) return [3 /*break*/, 9];
                                metricsInput = page
                                    .getByLabel(/metrics.*interval/i)
                                    .or(page.locator('input[data-testid*="metrics-interval"]'));
                                return [4 /*yield*/, metricsInput.fill(String(options.metricsIntervalSeconds))];
                            case 8:
                                _a.sent();
                                _a.label = 9;
                            case 9:
                                if (!(options.enableTLS !== undefined)) return [3 /*break*/, 13];
                                tlsCheckbox = page.getByRole('checkbox', { name: /enable tls|tls/i });
                                if (!options.enableTLS) return [3 /*break*/, 11];
                                return [4 /*yield*/, tlsCheckbox.check()];
                            case 10:
                                _a.sent();
                                return [3 /*break*/, 13];
                            case 11: return [4 /*yield*/, tlsCheckbox.uncheck()];
                            case 12:
                                _a.sent();
                                _a.label = 13;
                            case 13: return [2 /*return*/];
                        }
                    });
                }); })];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); };
exports.fillAdvancedBundleForm = fillAdvancedBundleForm;
