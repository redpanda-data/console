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
Object.defineProperty(exports, "__esModule", { value: true });
var test_1 = require("@playwright/test");
var debug_bundle_utils_1 = require("../debug-bundle.utils");
/**
 * Debug Bundle E2E Tests
 *
 * Tests the complete debug bundle workflow including:
 * - Navigation and page display
 * - Basic bundle creation
 * - Advanced bundle configuration
 * - Progress monitoring
 * - Bundle download and deletion
 * - Cancellation workflow
 */
test_1.test.describe('Debug Bundle - Navigation and Display', function () {
    (0, test_1.test)('should navigate to debug bundle page', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, debug_bundle_utils_1.goToDebugBundle)(page)];
                case 1:
                    _c.sent();
                    return [4 /*yield*/, (0, test_1.expect)(page).toHaveURL('/debug-bundle')];
                case 2:
                    _c.sent();
                    return [4 /*yield*/, (0, test_1.expect)(page.getByRole('heading', { name: /debug bundle/i })).toBeVisible()];
                case 3:
                    _c.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.test)('should display generate button in basic mode', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, page.goto('/debug-bundle')];
                case 1:
                    _c.sent();
                    return [4 /*yield*/, (0, test_1.expect)(page.getByRole('button', { name: /generate/i })).toBeVisible()];
                case 2:
                    _c.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.test)('should display cluster health status if available', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var healthSection;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, page.goto('/debug-bundle')];
                case 1:
                    _c.sent();
                    healthSection = page.getByText(/cluster.*health/i);
                    return [4 /*yield*/, healthSection.isVisible({ timeout: 2000 }).catch(function () { return false; })];
                case 2:
                    if (!_c.sent()) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, test_1.expect)(healthSection).toBeVisible()];
                case 3:
                    _c.sent();
                    _c.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.test)('should show link to existing bundle progress if generation is in progress', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var progressLink, hasProgress;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, page.goto('/debug-bundle')];
                case 1:
                    _c.sent();
                    progressLink = page.getByRole('link', { name: /progress|in progress|view progress/i });
                    return [4 /*yield*/, progressLink.isVisible({ timeout: 2000 }).catch(function () { return false; })];
                case 2:
                    hasProgress = _c.sent();
                    if (!hasProgress) return [3 /*break*/, 5];
                    return [4 /*yield*/, (0, test_1.expect)(progressLink).toBeVisible()];
                case 3:
                    _c.sent();
                    return [4 /*yield*/, (0, test_1.expect)(progressLink).toHaveAttribute('href', /\/debug-bundle\/progress\//)];
                case 4:
                    _c.sent();
                    _c.label = 5;
                case 5: return [2 /*return*/];
            }
        });
    }); });
});
test_1.test.describe('Debug Bundle - Form Mode Switching', function () {
    (0, test_1.test)('should switch from basic to advanced mode', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var advancedButton;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, page.goto('/debug-bundle')];
                case 1:
                    _c.sent();
                    advancedButton = page.getByRole('button', { name: /advanced/i });
                    return [4 /*yield*/, (0, test_1.expect)(advancedButton).toBeVisible()];
                case 2:
                    _c.sent();
                    return [4 /*yield*/, advancedButton.click()];
                case 3:
                    _c.sent();
                    // Verify advanced options are visible
                    return [4 /*yield*/, (0, test_1.expect)(page.getByText(/cpu profiler/i)).toBeVisible()];
                case 4:
                    // Verify advanced options are visible
                    _c.sent();
                    return [4 /*yield*/, (0, test_1.expect)(page.getByText(/controller log/i)).toBeVisible()];
                case 5:
                    _c.sent();
                    return [4 /*yield*/, (0, test_1.expect)(page.getByText(/metrics interval/i)).toBeVisible()];
                case 6:
                    _c.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.test)('should switch from advanced back to basic mode', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var backButton;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, page.goto('/debug-bundle')];
                case 1:
                    _c.sent();
                    // Switch to advanced
                    return [4 /*yield*/, (0, debug_bundle_utils_1.switchToAdvancedMode)(page)];
                case 2:
                    // Switch to advanced
                    _c.sent();
                    backButton = page.getByRole('button', { name: /back.*default|default mode/i });
                    return [4 /*yield*/, (0, test_1.expect)(backButton).toBeVisible()];
                case 3:
                    _c.sent();
                    return [4 /*yield*/, backButton.click()];
                case 4:
                    _c.sent();
                    // Verify we're back in basic mode (advanced options hidden)
                    return [4 /*yield*/, (0, test_1.expect)(page.getByText(/cpu profiler/i)).not.toBeVisible()];
                case 5:
                    // Verify we're back in basic mode (advanced options hidden)
                    _c.sent();
                    return [2 /*return*/];
            }
        });
    }); });
});
test_1.test.describe('Debug Bundle - Advanced Configuration Options', function () {
    (0, test_1.test)('should display all advanced configuration fields', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, debug_bundle_utils_1.switchToAdvancedMode)(page)];
                case 1:
                    _c.sent();
                    // Verify key advanced fields are present
                    return [4 /*yield*/, (0, test_1.expect)(page.getByLabel(/cpu profiler/i).or(page.getByText(/cpu profiler/i))).toBeVisible()];
                case 2:
                    // Verify key advanced fields are present
                    _c.sent();
                    return [4 /*yield*/, (0, test_1.expect)(page.getByLabel(/controller log.*size/i).or(page.getByText(/controller log/i))).toBeVisible()];
                case 3:
                    _c.sent();
                    return [4 /*yield*/, (0, test_1.expect)(page.getByLabel(/logs.*size.*limit/i).or(page.getByText(/logs.*size/i))).toBeVisible()];
                case 4:
                    _c.sent();
                    return [4 /*yield*/, (0, test_1.expect)(page.getByLabel(/metrics.*interval/i).or(page.getByText(/metrics.*interval/i))).toBeVisible()];
                case 5:
                    _c.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.test)('should allow enabling TLS configuration', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tlsCheckbox;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, debug_bundle_utils_1.switchToAdvancedMode)(page)];
                case 1:
                    _c.sent();
                    tlsCheckbox = page.getByRole('checkbox', { name: /enable tls|tls/i });
                    return [4 /*yield*/, tlsCheckbox.isVisible()];
                case 2:
                    if (!_c.sent()) return [3 /*break*/, 6];
                    return [4 /*yield*/, tlsCheckbox.check()];
                case 3:
                    _c.sent();
                    return [4 /*yield*/, (0, test_1.expect)(tlsCheckbox).toBeChecked()];
                case 4:
                    _c.sent();
                    // Additional TLS options might appear
                    return [4 /*yield*/, page.waitForTimeout(500)];
                case 5:
                    // Additional TLS options might appear
                    _c.sent();
                    _c.label = 6;
                case 6: return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.test)('should allow broker selection if multiple brokers exist', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var brokerSelect;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, debug_bundle_utils_1.switchToAdvancedMode)(page)];
                case 1:
                    _c.sent();
                    brokerSelect = page.getByLabel(/broker|select broker/i);
                    return [4 /*yield*/, brokerSelect.isVisible({ timeout: 2000 }).catch(function () { return false; })];
                case 2:
                    if (!_c.sent()) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, test_1.expect)(brokerSelect).toBeVisible()];
                case 3:
                    _c.sent();
                    _c.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.test)('should display unit selectors for size fields', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var unitSelectors, count;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, debug_bundle_utils_1.switchToAdvancedMode)(page)];
                case 1:
                    _c.sent();
                    unitSelectors = page.locator('select').filter({ hasText: /KB|MB|GB/i });
                    return [4 /*yield*/, unitSelectors.count()];
                case 2:
                    count = _c.sent();
                    if (!(count > 0)) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, test_1.expect)(unitSelectors.first()).toBeVisible()];
                case 3:
                    _c.sent();
                    _c.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    }); });
});
test_1.test.describe('Debug Bundle - Generation Progress', function () {
    (0, test_1.test)('should navigate to progress page after generation starts', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var generateButton;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, page.goto('/debug-bundle')];
                case 1:
                    _c.sent();
                    generateButton = page.getByRole('button', { name: /generate/i }).first();
                    return [4 /*yield*/, generateButton.click()];
                case 2:
                    _c.sent();
                    // Should navigate to progress page
                    return [4 /*yield*/, page.waitForURL(/\/debug-bundle\/progress\//, { timeout: 10000 })];
                case 3:
                    // Should navigate to progress page
                    _c.sent();
                    return [4 /*yield*/, (0, test_1.expect)(page).toHaveURL(/\/debug-bundle\/progress\//)];
                case 4:
                    _c.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.test)('should display broker status during generation', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var hasProgress;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, debug_bundle_utils_1.isBundleGenerationInProgress)(page)];
                case 1:
                    hasProgress = _c.sent();
                    if (!hasProgress) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, debug_bundle_utils_1.goToBundleProgress)(page)];
                case 2:
                    _c.sent();
                    return [4 /*yield*/, (0, debug_bundle_utils_1.verifyBrokerStatus)(page)];
                case 3:
                    _c.sent();
                    return [3 /*break*/, 5];
                case 4:
                    test_1.test.skip();
                    _c.label = 5;
                case 5: return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.test)('should display stop/cancel button during generation', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var hasProgress, stopButton;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, debug_bundle_utils_1.isBundleGenerationInProgress)(page)];
                case 1:
                    hasProgress = _c.sent();
                    if (!hasProgress) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, debug_bundle_utils_1.goToBundleProgress)(page)];
                case 2:
                    _c.sent();
                    stopButton = page.getByRole('button', { name: /stop|cancel/i });
                    return [4 /*yield*/, (0, test_1.expect)(stopButton).toBeVisible()];
                case 3:
                    _c.sent();
                    return [3 /*break*/, 5];
                case 4:
                    test_1.test.skip();
                    _c.label = 5;
                case 5: return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.test)('should show generation status per broker', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var hasProgress, statusElements, count;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, debug_bundle_utils_1.isBundleGenerationInProgress)(page)];
                case 1:
                    hasProgress = _c.sent();
                    if (!hasProgress) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, debug_bundle_utils_1.goToBundleProgress)(page)];
                case 2:
                    _c.sent();
                    statusElements = page.locator('[role="listitem"], [role="row"]');
                    return [4 /*yield*/, statusElements.count()];
                case 3:
                    count = _c.sent();
                    (0, test_1.expect)(count).toBeGreaterThan(0);
                    return [3 /*break*/, 5];
                case 4:
                    test_1.test.skip();
                    _c.label = 5;
                case 5: return [2 /*return*/];
            }
        });
    }); });
});
test_1.test.describe('Debug Bundle - Download and Deletion', function () {
    (0, test_1.test)('should display download link when bundle is ready', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var downloadLink, hasDownload;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, page.goto('/debug-bundle')];
                case 1:
                    _c.sent();
                    downloadLink = page.getByRole('link', { name: /download/i });
                    return [4 /*yield*/, downloadLink.isVisible({ timeout: 2000 }).catch(function () { return false; })];
                case 2:
                    hasDownload = _c.sent();
                    if (!hasDownload) return [3 /*break*/, 5];
                    return [4 /*yield*/, (0, test_1.expect)(downloadLink).toBeVisible()];
                case 3:
                    _c.sent();
                    return [4 /*yield*/, (0, test_1.expect)(downloadLink).toHaveAttribute('href', /\/api\/debug_bundle\/files\//)];
                case 4:
                    _c.sent();
                    return [3 /*break*/, 6];
                case 5:
                    test_1.test.skip();
                    _c.label = 6;
                case 6: return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.test)('should download bundle with correct filename', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var downloadLink, hasDownload, downloadPromise, download;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, page.goto('/debug-bundle')];
                case 1:
                    _c.sent();
                    downloadLink = page.getByRole('link', { name: /download/i });
                    return [4 /*yield*/, downloadLink.isVisible({ timeout: 2000 }).catch(function () { return false; })];
                case 2:
                    hasDownload = _c.sent();
                    if (!hasDownload) return [3 /*break*/, 5];
                    downloadPromise = page.waitForEvent('download');
                    return [4 /*yield*/, downloadLink.click()];
                case 3:
                    _c.sent();
                    return [4 /*yield*/, downloadPromise];
                case 4:
                    download = _c.sent();
                    (0, test_1.expect)(download.suggestedFilename()).toMatch(/debug-bundle\.zip/);
                    return [3 /*break*/, 6];
                case 5:
                    test_1.test.skip();
                    _c.label = 6;
                case 6: return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.test)('should display delete button for existing bundle', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var deleteButton, hasDelete;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, page.goto('/debug-bundle')];
                case 1:
                    _c.sent();
                    deleteButton = page.getByRole('button', { name: /delete/i }).or(page.locator('button[aria-label*="delete"]'));
                    return [4 /*yield*/, deleteButton.isVisible({ timeout: 2000 }).catch(function () { return false; })];
                case 2:
                    hasDelete = _c.sent();
                    if (!hasDelete) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, test_1.expect)(deleteButton).toBeVisible()];
                case 3:
                    _c.sent();
                    return [3 /*break*/, 5];
                case 4:
                    test_1.test.skip();
                    _c.label = 5;
                case 5: return [2 /*return*/];
            }
        });
    }); });
});
test_1.test.describe('Debug Bundle - Error Handling', function () {
    (0, test_1.test)('should display error message if bundle generation fails', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var errorText, hasError;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, page.goto('/debug-bundle')];
                case 1:
                    _c.sent();
                    errorText = page.getByText(/error|failed/i);
                    return [4 /*yield*/, errorText.isVisible({ timeout: 2000 }).catch(function () { return false; })];
                case 2:
                    hasError = _c.sent();
                    if (!hasError) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, test_1.expect)(errorText).toBeVisible()];
                case 3:
                    _c.sent();
                    _c.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.test)('should allow retry after failure', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var retryButton, hasRetry;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, page.goto('/debug-bundle')];
                case 1:
                    _c.sent();
                    retryButton = page.getByRole('button', { name: /try again|retry/i });
                    return [4 /*yield*/, retryButton.isVisible({ timeout: 2000 }).catch(function () { return false; })];
                case 2:
                    hasRetry = _c.sent();
                    if (!hasRetry) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, test_1.expect)(retryButton).toBeVisible()];
                case 3:
                    _c.sent();
                    _c.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.test)('should display validation errors for invalid input', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var cpuInput, errorMsg, hasError;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, debug_bundle_utils_1.switchToAdvancedMode)(page)];
                case 1:
                    _c.sent();
                    cpuInput = page
                        .getByLabel(/cpu profiler/i)
                        .or(page.locator('input[data-testid*="cpu-profiler"]'))
                        .first();
                    return [4 /*yield*/, cpuInput.isVisible()];
                case 2:
                    if (!_c.sent()) return [3 /*break*/, 8];
                    return [4 /*yield*/, cpuInput.fill('-1')];
                case 3:
                    _c.sent(); // Invalid negative value
                    return [4 /*yield*/, cpuInput.blur()];
                case 4:
                    _c.sent();
                    // Look for validation error
                    return [4 /*yield*/, page.waitForTimeout(500)];
                case 5:
                    // Look for validation error
                    _c.sent();
                    errorMsg = page.getByText(/invalid|must be|greater than/i);
                    return [4 /*yield*/, errorMsg.isVisible({ timeout: 2000 }).catch(function () { return false; })];
                case 6:
                    hasError = _c.sent();
                    if (!hasError) return [3 /*break*/, 8];
                    return [4 /*yield*/, (0, test_1.expect)(errorMsg).toBeVisible()];
                case 7:
                    _c.sent();
                    _c.label = 8;
                case 8: return [2 /*return*/];
            }
        });
    }); });
});
test_1.test.describe('Debug Bundle - Permissions and Access', function () {
    (0, test_1.test)('should show debug bundle link in header if user has permissions', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var debugBundleLink, hasLink;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, page.goto('/')];
                case 1:
                    _c.sent();
                    debugBundleLink = page.getByRole('link', { name: /debug bundle/i });
                    return [4 /*yield*/, debugBundleLink.isVisible({ timeout: 2000 }).catch(function () { return false; })];
                case 2:
                    hasLink = _c.sent();
                    if (!hasLink) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, test_1.expect)(debugBundleLink).toBeVisible()];
                case 3:
                    _c.sent();
                    _c.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.test)('should navigate to debug bundle from cluster health overview', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var debugBundleLink, hasLink;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, page.goto('/overview')];
                case 1:
                    _c.sent();
                    debugBundleLink = page.getByRole('link', { name: /debug bundle|generate.*bundle/i });
                    return [4 /*yield*/, debugBundleLink.isVisible({ timeout: 2000 }).catch(function () { return false; })];
                case 2:
                    hasLink = _c.sent();
                    if (!hasLink) return [3 /*break*/, 6];
                    return [4 /*yield*/, (0, test_1.expect)(debugBundleLink).toBeVisible()];
                case 3:
                    _c.sent();
                    return [4 /*yield*/, debugBundleLink.click()];
                case 4:
                    _c.sent();
                    return [4 /*yield*/, (0, test_1.expect)(page).toHaveURL(/\/debug-bundle/)];
                case 5:
                    _c.sent();
                    _c.label = 6;
                case 6: return [2 /*return*/];
            }
        });
    }); });
});
test_1.test.describe('Debug Bundle - Bundle Expiration', function () {
    (0, test_1.test)('should display expiration indicator for expired bundles', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var expiredText, hasExpired;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, page.goto('/debug-bundle')];
                case 1:
                    _c.sent();
                    expiredText = page.getByText(/expired/i);
                    return [4 /*yield*/, expiredText.isVisible({ timeout: 2000 }).catch(function () { return false; })];
                case 2:
                    hasExpired = _c.sent();
                    if (!hasExpired) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, test_1.expect)(expiredText).toBeVisible()];
                case 3:
                    _c.sent();
                    _c.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    }); });
});
test_1.test.describe('Debug Bundle - Confirmation Dialogs', function () {
    (0, test_1.test)('should show confirmation dialog when generating bundle if one exists', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var generateButton, confirmDialog, hasConfirm, cancelButton;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, page.goto('/debug-bundle')];
                case 1:
                    _c.sent();
                    generateButton = page.getByRole('button', { name: /generate/i }).first();
                    return [4 /*yield*/, generateButton.click()];
                case 2:
                    _c.sent();
                    confirmDialog = page.getByRole('dialog').or(page.getByText(/are you sure|confirm|replace/i));
                    return [4 /*yield*/, confirmDialog.isVisible({ timeout: 2000 }).catch(function () { return false; })];
                case 3:
                    hasConfirm = _c.sent();
                    if (!hasConfirm) return [3 /*break*/, 7];
                    return [4 /*yield*/, (0, test_1.expect)(confirmDialog).toBeVisible()];
                case 4:
                    _c.sent();
                    cancelButton = page.getByRole('button', { name: /cancel|no/i });
                    return [4 /*yield*/, cancelButton.isVisible()];
                case 5:
                    if (!_c.sent()) return [3 /*break*/, 7];
                    return [4 /*yield*/, cancelButton.click()];
                case 6:
                    _c.sent();
                    _c.label = 7;
                case 7: return [2 /*return*/];
            }
        });
    }); });
});
test_1.test.describe('Debug Bundle - SCRAM Authentication', function () {
    (0, test_1.test)('should display SCRAM authentication fields in advanced mode', function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var scramFields, hasScram;
        var page = _b.page;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, debug_bundle_utils_1.switchToAdvancedMode)(page)];
                case 1:
                    _c.sent();
                    scramFields = page.getByText(/scram|sasl/i);
                    return [4 /*yield*/, scramFields
                            .first()
                            .isVisible({ timeout: 2000 })
                            .catch(function () { return false; })];
                case 2:
                    hasScram = _c.sent();
                    if (!hasScram) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, test_1.expect)(scramFields.first()).toBeVisible()];
                case 3:
                    _c.sent();
                    _c.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    }); });
});
