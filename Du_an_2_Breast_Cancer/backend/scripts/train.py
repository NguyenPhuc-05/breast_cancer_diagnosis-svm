"""Train and evaluate the Project 2 Breast Cancer SVM artifact.

The held-out test split is not used for hyperparameter or threshold selection.
The malignant decision threshold is selected only from out-of-fold probabilities
on the training split, then locked before the single test evaluation.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import sklearn
from sklearn.base import clone
from sklearn.datasets import load_breast_cancer
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import (
    GridSearchCV,
    StratifiedKFold,
    cross_val_predict,
    train_test_split,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC


RANDOM_STATE = 42
TEST_SIZE = 0.20
TARGET_SENSITIVITY = 0.98
MODEL_VERSION = "2.0.0"
WARNING = (
    "Educational use only; not a medical diagnosis. Do not use this result "
    "for treatment or other clinical decisions."
)

BASE_DIR = Path(__file__).resolve().parents[1]
ARTIFACT_DIR = BASE_DIR / "artifacts"
MODEL_PATH = ARTIFACT_DIR / "breast_cancer_svm.joblib"
METADATA_PATH = ARTIFACT_DIR / "metadata.json"


def malignant_probabilities(model: Pipeline, features) -> np.ndarray:
    """Return probabilities for malignant, which is class 0 in this dataset."""
    classes = [int(value) for value in model.named_steps["svc"].classes_]
    if set(classes) != {0, 1}:
        raise RuntimeError(f"Unexpected model classes: {classes}")
    return model.predict_proba(features)[:, classes.index(0)]


def threshold_predictions(probability_malignant: np.ndarray, threshold: float) -> np.ndarray:
    """Classify as malignant (0) when its probability reaches the locked threshold."""
    return np.where(probability_malignant >= threshold, 0, 1)


def metric_bundle(y_true, predicted, probability_malignant) -> dict:
    """Compute metrics with malignant treated as the positive class."""
    matrix = confusion_matrix(y_true, predicted, labels=[0, 1])
    malignant_true_positive = int(matrix[0, 0])
    malignant_false_negative = int(matrix[0, 1])
    benign_false_positive = int(matrix[1, 0])
    benign_true_negative = int(matrix[1, 1])
    benign_total = benign_false_positive + benign_true_negative
    specificity = benign_true_negative / benign_total if benign_total else 0.0
    y_malignant = (np.asarray(y_true) == 0).astype(int)

    return {
        "sample_count": int(len(y_true)),
        "accuracy": float(accuracy_score(y_true, predicted)),
        "sensitivity_malignant": float(
            recall_score(y_true, predicted, pos_label=0, zero_division=0)
        ),
        "specificity_benign": float(specificity),
        "precision_malignant": float(
            precision_score(y_true, predicted, pos_label=0, zero_division=0)
        ),
        "f1_malignant": float(
            f1_score(y_true, predicted, pos_label=0, zero_division=0)
        ),
        "roc_auc_malignant": float(
            roc_auc_score(y_malignant, probability_malignant)
        ),
        "pr_auc_malignant": float(
            average_precision_score(y_malignant, probability_malignant)
        ),
        "confusion_matrix": {
            "labels": ["malignant", "benign"],
            "matrix": matrix.astype(int).tolist(),
            "malignant_true_positive": malignant_true_positive,
            "malignant_false_negative": malignant_false_negative,
            "benign_false_positive": benign_false_positive,
            "benign_true_negative": benign_true_negative,
        },
    }


def select_threshold(y_true, probability_malignant) -> tuple[float, dict]:
    """Choose the OOF threshold with best specificity at target sensitivity.

    Candidate thresholds come only from OOF training probabilities. Ties are
    resolved by malignant precision and then the higher threshold.
    """
    candidates = np.unique(
        np.concatenate(([0.0], np.asarray(probability_malignant), [1.0]))
    )
    evaluated: list[tuple[float, dict]] = []
    for threshold in candidates:
        predicted = threshold_predictions(probability_malignant, float(threshold))
        evaluated.append(
            (float(threshold), metric_bundle(y_true, predicted, probability_malignant))
        )

    feasible = [
        item
        for item in evaluated
        if item[1]["sensitivity_malignant"] >= TARGET_SENSITIVITY
    ]
    if not feasible:
        best = max(
            evaluated,
            key=lambda item: (
                item[1]["sensitivity_malignant"],
                item[1]["specificity_benign"],
                item[1]["precision_malignant"],
                item[0],
            ),
        )
        target_met = False
    else:
        best = max(
            feasible,
            key=lambda item: (
                item[1]["specificity_benign"],
                item[1]["precision_malignant"],
                item[0],
            ),
        )
        target_met = True

    threshold, metrics = best
    selection = {
        "source": "out_of_fold_training_probabilities",
        "target_sensitivity_malignant": TARGET_SENSITIVITY,
        "target_met": target_met,
        "candidate_count": int(len(candidates)),
        "selected_oof_sensitivity_malignant": metrics["sensitivity_malignant"],
        "selected_oof_specificity_benign": metrics["specificity_benign"],
    }
    return threshold, selection


def print_metrics(name: str, metrics: dict) -> None:
    print(f"\n{name}")
    print(json.dumps(metrics, ensure_ascii=False, indent=2))


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    bundle = load_breast_cancer(as_frame=True)
    X = bundle.data
    y = bundle.target

    if list(bundle.target_names) != ["malignant", "benign"]:
        raise RuntimeError(f"Unexpected target mapping: {list(bundle.target_names)}")
    if X.shape != (569, 30) or X.isna().any().any():
        raise RuntimeError(f"Unexpected dataset shape or missing values: {X.shape}")

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=TEST_SIZE,
        stratify=y,
        random_state=RANDOM_STATE,
    )

    pipeline = Pipeline(
        [
            ("scaler", StandardScaler()),
            (
                "svc",
                SVC(
                    kernel="rbf",
                    probability=True,
                    class_weight="balanced",
                    random_state=RANDOM_STATE,
                ),
            ),
        ]
    )
    param_grid = {
        "svc__C": [0.1, 1, 10, 100],
        "svc__gamma": ["scale", 0.001, 0.01, 0.1],
    }
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    search = GridSearchCV(
        estimator=pipeline,
        param_grid=param_grid,
        scoring="recall_macro",
        cv=cv,
        n_jobs=-1,
        refit=True,
        return_train_score=True,
    )
    search.fit(X_train, y_train)
    model = search.best_estimator_

    # Threshold selection uses only out-of-fold predictions on the training split.
    oof_probabilities_all_classes = cross_val_predict(
        clone(model),
        X_train,
        y_train,
        cv=cv,
        method="predict_proba",
        n_jobs=-1,
    )
    classes = [int(value) for value in model.named_steps["svc"].classes_]
    oof_probability_malignant = oof_probabilities_all_classes[:, classes.index(0)]
    threshold, threshold_selection = select_threshold(
        y_train.to_numpy(), oof_probability_malignant
    )

    # The threshold is now locked. The held-out test split is evaluated once below.
    train_probability_malignant = malignant_probabilities(model, X_train)
    train_metrics = metric_bundle(
        y_train,
        threshold_predictions(train_probability_malignant, threshold),
        train_probability_malignant,
    )
    oof_metrics = metric_bundle(
        y_train,
        threshold_predictions(oof_probability_malignant, threshold),
        oof_probability_malignant,
    )
    test_probability_malignant = malignant_probabilities(model, X_test)
    test_metrics = metric_bundle(
        y_test,
        threshold_predictions(test_probability_malignant, threshold),
        test_probability_malignant,
    )

    feature_ranges = {
        feature: {
            "minimum": float(X[feature].min()),
            "maximum": float(X[feature].max()),
        }
        for feature in X.columns
    }
    metrics = {
        "train": train_metrics,
        "oof_cross_validation": oof_metrics,
        "test": test_metrics,
        "grid_search": {
            "scoring": "recall_macro",
            "best_cv_score": float(search.best_score_),
            "best_mean_train_score": float(
                search.cv_results_["mean_train_score"][search.best_index_]
            ),
            "folds": 5,
        },
    }
    metadata = {
        "model_name": "breast-cancer-svm-rbf",
        "model_version": MODEL_VERSION,
        "dataset": {
            "name": "Breast Cancer Wisconsin Diagnostic",
            "sample_count": int(len(X)),
            "class_counts": {
                "malignant": int((y == 0).sum()),
                "benign": int((y == 1).sum()),
            },
        },
        "feature_names": list(X.columns),
        "feature_ranges": feature_ranges,
        "class_mapping": {"0": "malignant", "1": "benign"},
        "best_params": search.best_params_,
        "threshold": float(threshold),
        "threshold_selection": threshold_selection,
        "metrics": metrics,
        "split": {
            "test_size": TEST_SIZE,
            "random_state": RANDOM_STATE,
            "stratified": True,
            "train_samples": int(len(X_train)),
            "test_samples": int(len(X_test)),
        },
        "sklearn_version": sklearn.__version__,
        "warning": WARNING,
    }

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    METADATA_PATH.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"Dataset: X={X.shape}, classes={metadata['dataset']['class_counts']}")
    print(f"Best parameters: {search.best_params_}")
    print(f"Best CV recall_macro: {search.best_score_:.6f}")
    print(f"Locked malignant threshold: {threshold:.12f}")
    print_metrics("TRAIN METRICS", train_metrics)
    print_metrics("OOF CV METRICS", oof_metrics)
    print_metrics("HELD-OUT TEST METRICS", test_metrics)
    print(f"\nSaved model: {MODEL_PATH}")
    print(f"Saved metadata: {METADATA_PATH}")


if __name__ == "__main__":
    main()
