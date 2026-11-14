import json
from pathlib import Path

import joblib
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC


BACKEND_DIR = Path(__file__).resolve().parents[1]
ARTIFACT_DIR = BACKEND_DIR / "artifacts"
METADATA = json.loads((ARTIFACT_DIR / "metadata.json").read_text(encoding="utf-8"))
MODEL = joblib.load(ARTIFACT_DIR / "breast_cancer_svm.joblib")


def test_artifact_is_required_scaler_svc_pipeline():
    assert isinstance(MODEL, Pipeline)
    assert isinstance(MODEL.named_steps["scaler"], StandardScaler)
    svc = MODEL.named_steps["svc"]
    assert isinstance(svc, SVC)
    assert svc.kernel == "rbf"
    assert svc.probability is True
    assert svc.class_weight == "balanced"
    assert svc.C == 10
    assert svc.gamma == 0.01


def test_metadata_records_oof_threshold_selection():
    selection = METADATA["threshold_selection"]
    assert 0.0 < METADATA["threshold"] < 1.0
    assert selection["source"] == "out_of_fold_training_probabilities"
    assert selection["target_sensitivity_malignant"] == 0.98
    assert selection["target_met"] is True
    assert selection["selected_oof_sensitivity_malignant"] >= 0.98


def test_metadata_contains_complete_required_metrics():
    required = {
        "accuracy",
        "sensitivity_malignant",
        "specificity_benign",
        "precision_malignant",
        "f1_malignant",
        "roc_auc_malignant",
        "pr_auc_malignant",
        "confusion_matrix",
    }
    for split in ("train", "oof_cross_validation", "test"):
        assert required <= METADATA["metrics"][split].keys()
        matrix = METADATA["metrics"][split]["confusion_matrix"]["matrix"]
        assert len(matrix) == 2
        assert all(len(row) == 2 for row in matrix)


def test_metadata_describes_reproducible_split_and_dataset():
    assert METADATA["dataset"]["sample_count"] == 569
    assert METADATA["dataset"]["class_counts"] == {
        "malignant": 212,
        "benign": 357,
    }
    assert len(METADATA["feature_names"]) == 30
    assert set(METADATA["feature_names"]) == set(METADATA["feature_ranges"])
    assert METADATA["class_mapping"] == {"0": "malignant", "1": "benign"}
    assert METADATA["split"] == {
        "test_size": 0.2,
        "random_state": 42,
        "stratified": True,
        "train_samples": 455,
        "test_samples": 114,
    }


def test_test_confusion_matrix_accounts_for_every_held_out_row():
    matrix = METADATA["metrics"]["test"]["confusion_matrix"]["matrix"]
    assert sum(sum(row) for row in matrix) == 114
    assert METADATA["metrics"]["test"]["sample_count"] == 114
