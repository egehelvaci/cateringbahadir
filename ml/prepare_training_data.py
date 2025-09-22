import json
import pandas as pd
from typing import List, Dict
import re

# Sample email data with labels
training_data = [
    # CARGO emails
    {
        "subject": "New Cargo Inquiry - 500 MT Steel Pipes",
        "body": "We have a cargo of 500 metric tons of steel pipes ready for shipment from Shanghai to Rotterdam. Looking for suitable vessel.",
        "sender": "cargo@logistics.com",
        "type": "CARGO"
    },
    {
        "subject": "Urgent: Container booking needed",
        "body": "Need to book 20 TEU containers for electronics shipment. Origin: Shenzhen, Destination: Hamburg",
        "sender": "shipper@export.cn",
        "type": "CARGO"
    },
    {
        "subject": "Bulk cargo - Grain shipment",
        "body": "50,000 MT wheat cargo available ex Brazil ports. Looking for Panamax vessel for voyage to Mediterranean",
        "sender": "graintrader@agri.br",
        "type": "CARGO"
    },
    {
        "subject": "Project cargo inquiry",
        "body": "Heavy lift cargo consisting of turbines and generators. Total weight 200 MT. Need specialized vessel with cranes",
        "sender": "project@energy.de",
        "type": "CARGO"
    },
    {
        "subject": "Chemical tanker cargo",
        "body": "5000 MT caustic soda solution for shipment. IMO Class 8. Need chemical tanker with stainless steel tanks",
        "sender": "chemical@trade.com",
        "type": "CARGO"
    },
    {
        "subject": "Coal shipment inquiry",
        "body": "Steam coal cargo 75,000 MT available at Indonesian ports. Looking for Capesize vessel",
        "sender": "coal@mining.id",
        "type": "CARGO"
    },
    {
        "subject": "Reefer cargo - Frozen food",
        "body": "1000 MT frozen chicken cargo. Temperature requirement -18C. Need reefer vessel or containers",
        "sender": "food@export.th",
        "type": "CARGO"
    },
    {
        "subject": "Iron ore cargo tender",
        "body": "Iron ore fines 170,000 MT from Australia to China. Capesize vessel required",
        "sender": "ironore@resources.au",
        "type": "CARGO"
    },
    {
        "subject": "LNG cargo spot sale",
        "body": "LNG cargo 145,000 cbm available for spot sale. Loading port: Qatar, discharge options Asia",
        "sender": "lng@energy.qa",
        "type": "CARGO"
    },
    {
        "subject": "Cement cargo booking",
        "body": "Bulk cement 10,000 MT in bags. From Vietnam to Philippines. Need geared vessel",
        "sender": "cement@construction.vn",
        "type": "CARGO"
    },
    
    # VESSEL emails
    {
        "subject": "MV Pacific Dream - Open for cargo",
        "body": "Vessel MV Pacific Dream, Handymax bulk carrier, DWT 58,000 MT, open at Singapore from next week. Ready for grain/coal cargoes",
        "sender": "operations@shipping.sg",
        "type": "VESSEL"
    },
    {
        "subject": "Container vessel available",
        "body": "Container vessel 8,500 TEU capacity available for charter. Current position Mediterranean. Can accommodate reefer containers",
        "sender": "chartering@maritime.gr",
        "type": "VESSEL"
    },
    {
        "subject": "Tanker vessel for spot charter",
        "body": "Product tanker, 50,000 DWT, double hull, available for spot charter. All certificates valid. Position: Persian Gulf",
        "sender": "tanker@fleet.ae",
        "type": "VESSEL"
    },
    {
        "subject": "Bulk carrier open position",
        "body": "Panamax bulk carrier, 75,000 DWT, 5 holds/5 hatches, geared with 4x30T cranes. Open Japan next month",
        "sender": "bulkops@vessel.jp",
        "type": "VESSEL"
    },
    {
        "subject": "Chemical tanker available",
        "body": "Chemical tanker 20,000 DWT, stainless steel tanks, IMO II/III. Valid certificates. Open Houston area",
        "sender": "chemical@tankers.us",
        "type": "VESSEL"
    },
    {
        "subject": "VLCC for time charter",
        "body": "VLCC 300,000 DWT available for 1-year time charter. Double hull, 15 years old. All surveys passed",
        "sender": "vlcc@supertanker.no",
        "type": "VESSEL"
    },
    {
        "subject": "General cargo vessel",
        "body": "General cargo vessel 12,000 DWT with box-shaped holds. Good for project cargo. Open Mediterranean",
        "sender": "general@cargo.it",
        "type": "VESSEL"
    },
    {
        "subject": "LNG carrier available",
        "body": "LNG carrier 155,000 cbm capacity, membrane type, available for spot or term charter",
        "sender": "lng@carriers.kr",
        "type": "VESSEL"
    },
    {
        "subject": "Capesize bulk carrier",
        "body": "Capesize vessel 180,000 DWT open Brazil. Suitable for iron ore and coal shipments",
        "sender": "cape@bulk.cn",
        "type": "VESSEL"
    },
    {
        "subject": "Multipurpose vessel MPP",
        "body": "MPP vessel 8,000 DWT with 2x120T cranes. Suitable for containers, bulk and breakbulk cargo",
        "sender": "mpp@versatile.nl",
        "type": "VESSEL"
    },
    
    # More CARGO examples with variations
    {
        "subject": "Scrap metal cargo",
        "body": "HMS 1&2 scrap metal 5,000 MT ready for loading. Need bulk carrier with grabs",
        "sender": "scrap@recycling.in",
        "type": "CARGO"
    },
    {
        "subject": "Timber logs shipment",
        "body": "Timber logs from West Africa to China. Volume 15,000 cbm. Need log carrier",
        "sender": "timber@forestry.cm",
        "type": "CARGO"
    },
    {
        "subject": "Bagged rice cargo",
        "body": "Rice in 50kg bags, total 8,000 MT. From Thailand to West Africa ports",
        "sender": "rice@agri.th",
        "type": "CARGO"
    },
    {
        "subject": "Automotive parts in containers",
        "body": "Auto parts shipment, 40 x 40ft containers. From Germany to USA East Coast",
        "sender": "auto@parts.de",
        "type": "CARGO"
    },
    {
        "subject": "Crude oil cargo tender",
        "body": "Crude oil cargo 2 million barrels available. Loading at Middle East ports",
        "sender": "crude@petroleum.sa",
        "type": "CARGO"
    },
    
    # More VESSEL examples with variations
    {
        "subject": "Feeder vessel 1,700 TEU",
        "body": "Small container vessel 1,700 TEU available for charter. Ideal for feeder service",
        "sender": "feeder@container.dk",
        "type": "VESSEL"
    },
    {
        "subject": "Oil tanker Aframax size",
        "body": "Aframax tanker 115,000 DWT, ice class, available Baltic Sea area",
        "sender": "aframax@tanker.fi",
        "type": "VESSEL"
    },
    {
        "subject": "Car carrier PCTC available",
        "body": "Pure car truck carrier 6,500 cars capacity. Available for charter Asia-Europe trade",
        "sender": "pctc@roro.jp",
        "type": "VESSEL"
    },
    {
        "subject": "Heavy lift vessel with cranes",
        "body": "Heavy lift vessel with 2x400T cranes. Suitable for project cargo and offshore equipment",
        "sender": "heavylift@special.de",
        "type": "VESSEL"
    },
    {
        "subject": "Handysize bulk carrier prompt",
        "body": "Handysize 35,000 DWT prompt vessel available South America east coast",
        "sender": "handy@bulk.ar",
        "type": "VESSEL"
    }
]

def extract_features(email: Dict) -> Dict:
    """Extract features from email for classification"""
    features = {}
    
    text = f"{email.get('subject', '')} {email.get('body', '')}".lower()
    
    # Cargo-related keywords
    cargo_keywords = [
        'cargo', 'shipment', 'loading', 'discharge', 'commodity', 'mt', 'metric tons',
        'teu', 'container', 'bulk', 'breakbulk', 'project cargo', 'reefer',
        'grain', 'coal', 'iron ore', 'steel', 'chemical', 'oil', 'lng', 'cement',
        'timber', 'logs', 'rice', 'wheat', 'sugar', 'fertilizer', 'bauxite',
        'alumina', 'copper', 'nickel', 'scrap', 'metal', 'frozen', 'food',
        'electronics', 'automotive', 'parts', 'machinery', 'equipment',
        'need vessel', 'looking for vessel', 'require vessel', 'booking',
        'freight rate', 'laycan', 'load port', 'discharge port', 'destination'
    ]
    
    # Vessel-related keywords
    vessel_keywords = [
        'vessel', 'ship', 'mv', 'm/v', 'dwt', 'draft', 'loa', 'beam', 'open',
        'available', 'position', 'charter', 'hire', 'tc', 'time charter',
        'voyage charter', 'spot', 'panamax', 'capesize', 'handymax', 'handysize',
        'supramax', 'ultramax', 'vlcc', 'suezmax', 'aframax', 'tanker',
        'bulk carrier', 'container vessel', 'general cargo', 'multipurpose',
        'mpp', 'heavy lift', 'chemical tanker', 'product tanker', 'lng carrier',
        'lpg carrier', 'car carrier', 'pctc', 'roro', 'reefer vessel',
        'crane', 'gear', 'geared', 'gearless', 'holds', 'hatches',
        'ice class', 'double hull', 'certificates', 'class', 'flag'
    ]
    
    # Count keyword occurrences
    features['cargo_keyword_count'] = sum(1 for keyword in cargo_keywords if keyword in text)
    features['vessel_keyword_count'] = sum(1 for keyword in vessel_keywords if keyword in text)
    
    # Check for specific patterns
    features['has_tonnage'] = bool(re.search(r'\d+[\s,]*(?:mt|tons?|dwt|teu|cbm)', text))
    features['has_vessel_name'] = bool(re.search(r'm/?v\s+[\w\s]+', text))
    features['has_port_names'] = bool(re.search(r'(singapore|rotterdam|shanghai|houston|hamburg|santos|yokohama)', text))
    
    # Length features
    features['subject_length'] = len(email.get('subject', ''))
    features['body_length'] = len(email.get('body', ''))
    
    # Sender domain features
    sender = email.get('sender', '')
    features['is_shipping_domain'] = any(domain in sender for domain in ['shipping', 'maritime', 'vessel', 'fleet', 'tanker', 'bulk'])
    features['is_cargo_domain'] = any(domain in sender for domain in ['cargo', 'logistics', 'export', 'import', 'trade', 'commodity'])
    
    return features

def prepare_dataset():
    """Prepare training dataset"""
    X = []
    y = []
    
    for email in training_data:
        features = extract_features(email)
        X.append(features)
        y.append(email['type'])
    
    df_features = pd.DataFrame(X)
    df_features['label'] = y
    
    return df_features

if __name__ == "__main__":
    # Prepare dataset
    df = prepare_dataset()
    
    # Save to CSV for training
    df.to_csv('ml/training_data.csv', index=False)
    
    # Also save raw emails for reference
    with open('ml/raw_training_emails.json', 'w', encoding='utf-8') as f:
        json.dump(training_data, f, indent=2, ensure_ascii=False)
    
    print(f"Prepared {len(df)} training samples")
    print(f"Label distribution:")
    print(df['label'].value_counts())
    print("\nFeature columns:", list(df.columns))