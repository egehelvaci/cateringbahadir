import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
import joblib
import json
from prepare_training_data import extract_features

def train_email_classifier():
    """Train and save email classification model"""
    
    # Load training data
    df = pd.read_csv('ml/training_data.csv')
    
    # Separate features and labels
    feature_columns = [col for col in df.columns if col != 'label']
    X = df[feature_columns].values
    y = df['label'].values
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Try different models
    models = {
        'RandomForest': RandomForestClassifier(
            n_estimators=100,
            max_depth=10,
            min_samples_split=2,
            min_samples_leaf=1,
            random_state=42
        ),
        'GradientBoosting': GradientBoostingClassifier(
            n_estimators=100,
            learning_rate=0.1,
            max_depth=5,
            random_state=42
        ),
        'LogisticRegression': LogisticRegression(
            max_iter=1000,
            random_state=42
        ),
        'SVM': SVC(
            kernel='rbf',
            probability=True,
            random_state=42
        )
    }
    
    best_model = None
    best_score = 0
    best_model_name = None
    
    print("Training and evaluating models...")
    print("-" * 50)
    
    for name, model in models.items():
        # Train model
        if name in ['LogisticRegression', 'SVM']:
            model.fit(X_train_scaled, y_train)
            y_pred = model.predict(X_test_scaled)
            train_data = X_train_scaled
        else:
            model.fit(X_train, y_train)
            y_pred = model.predict(X_test)
            train_data = X_train
        
        # Evaluate
        accuracy = accuracy_score(y_test, y_pred)
        
        # Cross-validation
        cv_scores = cross_val_score(model, train_data, y_train, cv=5)
        
        print(f"\n{name}:")
        print(f"Test Accuracy: {accuracy:.3f}")
        print(f"CV Score: {cv_scores.mean():.3f} (+/- {cv_scores.std() * 2:.3f})")
        print(f"Confusion Matrix:\n{confusion_matrix(y_test, y_pred)}")
        
        if accuracy > best_score:
            best_score = accuracy
            best_model = model
            best_model_name = name
    
    print("\n" + "=" * 50)
    print(f"Best Model: {best_model_name} with accuracy {best_score:.3f}")
    
    # Train final model on all data
    if best_model_name in ['LogisticRegression', 'SVM']:
        X_all_scaled = scaler.fit_transform(X)
        best_model.fit(X_all_scaled, y)
        # Save scaler
        joblib.dump(scaler, 'ml/scaler.pkl')
    else:
        best_model.fit(X, y)
    
    # Save model and metadata
    joblib.dump(best_model, 'ml/email_classifier.pkl')
    
    metadata = {
        'model_type': best_model_name,
        'accuracy': float(best_score),
        'feature_columns': feature_columns,
        'classes': ['CARGO', 'VESSEL'],
        'needs_scaling': best_model_name in ['LogisticRegression', 'SVM']
    }
    
    with open('ml/model_metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"\nModel saved to ml/email_classifier.pkl")
    print(f"Metadata saved to ml/model_metadata.json")
    
    # Test with sample emails
    print("\n" + "=" * 50)
    print("Testing with sample emails:")
    
    test_emails = [
        {
            "subject": "Steel coils 5000 MT ready for shipment",
            "body": "We have steel coils ready at Shanghai port. Need vessel for Japan",
            "sender": "steel@export.cn"
        },
        {
            "subject": "MV Star Eagle open position",
            "body": "Bulk carrier 55,000 DWT open Singapore next week",
            "sender": "ops@bulkship.sg"
        }
    ]
    
    for email in test_emails:
        features = extract_features(email)
        features_df = pd.DataFrame([features])[feature_columns]
        
        if metadata['needs_scaling']:
            features_array = scaler.transform(features_df.values)
        else:
            features_array = features_df.values
        
        prediction = best_model.predict(features_array)[0]
        probability = best_model.predict_proba(features_array)[0]
        
        print(f"\nEmail: {email['subject'][:50]}...")
        print(f"Prediction: {prediction}")
        print(f"Confidence: CARGO={probability[0]:.2f}, VESSEL={probability[1]:.2f}")

if __name__ == "__main__":
    # First prepare the data
    import prepare_training_data
    df = prepare_training_data.prepare_dataset()
    df.to_csv('ml/training_data.csv', index=False)
    
    # Train the model
    train_email_classifier()