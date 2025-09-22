// import { logger } from '../../utils/logger';

interface CargoInfo {
  cargo_type?: string;
  quantity_ton?: number;
  tolerance_pct?: number;
  load_ports?: string[];
  discharge_ports?: string[];
  laycan_start?: string;
  laycan_end?: string;
  requirements?: {
    solo_cargo?: boolean;
    no_transshipment?: boolean;
    stowage?: string;
    max_diameter_mm?: number;
    max_length_mm?: number;
    temperature?: string;
    special_equipment?: string[];
  };
  freight_rate?: string;
  payment_terms?: string;
}

interface VesselInfo {
  vessel_name?: string;
  imo?: string;
  dwt?: number;
  draft?: number;
  loa?: number;
  beam?: number;
  holds?: number;
  hatches?: number;
  eta?: string;
  next_open?: string;
  current_position?: string;
  geared?: boolean;
  crane_capacity?: string;
  vessel_type?: string;
  flag?: string;
  year_built?: number;
  class_society?: string;
  ice_class?: string;
}

export class InformationExtractor {
  /**
   * Extract cargo information from preprocessed email
   */
  public extractCargoInfo(text: string): CargoInfo {
    const info: CargoInfo = {};
    
    // Extract cargo type
    info.cargo_type = this.extractCargoType(text);
    
    // Extract quantity
    const quantity = this.extractQuantity(text);
    if (quantity) {
      info.quantity_ton = quantity.value;
      info.tolerance_pct = quantity.tolerance;
    }
    
    // Extract ports
    info.load_ports = this.extractLoadPorts(text);
    info.discharge_ports = this.extractDischargePorts(text);
    
    // Extract laycan dates
    const laycan = this.extractLaycan(text);
    if (laycan) {
      info.laycan_start = laycan.start;
      info.laycan_end = laycan.end;
    }
    
    // Extract requirements
    info.requirements = this.extractCargoRequirements(text);
    
    // Extract freight rate
    info.freight_rate = this.extractFreightRate(text);
    
    // Extract payment terms
    info.payment_terms = this.extractPaymentTerms(text);
    
    return info;
  }

  /**
   * Extract vessel information from preprocessed email
   */
  public extractVesselInfo(text: string): VesselInfo {
    const info: VesselInfo = {};
    
    // Extract vessel name
    info.vessel_name = this.extractVesselName(text);
    
    // Extract IMO
    info.imo = this.extractIMO(text);
    
    // Extract DWT
    info.dwt = this.extractDWT(text);
    
    // Extract dimensions
    const dimensions = this.extractVesselDimensions(text);
    if (dimensions) {
      info.loa = dimensions.loa;
      info.beam = dimensions.beam;
      info.draft = dimensions.draft;
    }
    
    // Extract holds/hatches
    info.holds = this.extractHolds(text);
    info.hatches = this.extractHatches(text);
    
    // Extract dates
    info.eta = this.extractETA(text);
    info.next_open = this.extractNextOpen(text);
    
    // Extract position
    info.current_position = this.extractCurrentPosition(text);
    
    // Extract vessel capabilities
    const capabilities = this.extractVesselCapabilities(text);
    info.geared = capabilities.geared;
    info.crane_capacity = capabilities.crane_capacity;
    
    // Extract vessel details
    info.vessel_type = this.extractVesselType(text);
    info.flag = this.extractFlag(text);
    info.year_built = this.extractYearBuilt(text);
    info.class_society = this.extractClassSociety(text);
    info.ice_class = this.extractIceClass(text);
    
    return info;
  }

  // Cargo extraction methods
  private extractCargoType(text: string): string | undefined {
    const cargoTypes = [
      'steel billets', 'steel coils', 'steel plates', 'steel pipes',
      'grain', 'wheat', 'corn', 'soybeans', 'barley', 'rice',
      'coal', 'steam coal', 'coking coal',
      'iron ore', 'iron ore fines', 'iron ore pellets',
      'cement', 'clinker', 'bauxite', 'alumina',
      'fertilizer', 'urea', 'phosphate', 'potash',
      'sugar', 'salt', 'timber', 'logs', 'lumber',
      'containers', 'project cargo', 'heavy lift', 'breakbulk'
    ];
    
    const lowerText = text.toLowerCase();
    for (const cargo of cargoTypes) {
      if (lowerText.includes(cargo)) {
        return cargo;
      }
    }
    
    // Generic pattern
    const pattern = /(?:cargo|commodity|shipment)(?:\s+of)?\s+([a-z\s]+?)(?:\s+\d+|\s+from|\s+to|\.|\,)/i;
    const match = text.match(pattern);
    return match ? match[1].trim() : undefined;
  }

  private extractQuantity(text: string): { value: number; tolerance?: number } | undefined {
    // Main quantity pattern
    const patterns = [
      /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:mt|metric tons?|tonnes?)/gi,
      /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:cbm|cubic meters?)/gi,
      /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:teu|feu)/gi
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const value = parseFloat(match[0].replace(/,/g, '').replace(/[^\d.]/g, ''));
        
        // Check for tolerance
        const tolerancePattern = /(?:plus\/minus|±|\+\/-)\s*(\d+)\s*%/i;
        const toleranceMatch = text.match(tolerancePattern);
        const tolerance = toleranceMatch ? parseFloat(toleranceMatch[1]) : undefined;
        
        return { value, tolerance };
      }
    }
    
    return undefined;
  }

  private extractLoadPorts(text: string): string[] {
    const ports: string[] = [];
    const patterns = [
      /(?:loading at?|load(?:ing)? port|from|ex)\s*:?\s*([A-Za-z\s,]+?)(?:\n|to|discharge|$)/gi,
      /(?:pol|port of loading)\s*:?\s*([A-Za-z\s,]+?)(?:\n|pod|$)/gi
    ];
    
    patterns.forEach(pattern => {
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => {
        const portList = match[1].split(/,|\sand\s/);
        portList.forEach(port => {
          const cleaned = port.trim();
          if (cleaned && !ports.includes(cleaned)) {
            ports.push(cleaned);
          }
        });
      });
    });
    
    return ports;
  }

  private extractDischargePorts(text: string): string[] {
    const ports: string[] = [];
    const patterns = [
      /(?:discharg(?:e|ing) at?|discharge port|to|destination)\s*:?\s*([A-Za-z\s,]+?)(?:\n|from|laycan|$)/gi,
      /(?:pod|port of discharge)\s*:?\s*([A-Za-z\s,]+?)(?:\n|$)/gi
    ];
    
    patterns.forEach(pattern => {
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => {
        const portList = match[1].split(/,|\sand\s/);
        portList.forEach(port => {
          const cleaned = port.trim();
          if (cleaned && !ports.includes(cleaned)) {
            ports.push(cleaned);
          }
        });
      });
    });
    
    return ports;
  }

  private extractLaycan(text: string): { start: string; end: string } | undefined {
    const patterns = [
      /laycan\s*:?\s*(\d{1,2})[/-](\d{1,2})\s*([A-Za-z]+)/i,
      /laycan\s*:?\s*(\d{1,2})\s*-\s*(\d{1,2})\s*([A-Za-z]+)/i,
      /laycan\s*:?\s*([A-Za-z]+)\s*(\d{1,2})\s*-\s*(\d{1,2})/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        // Parse and format the dates
        // This is simplified - in production, use a proper date parser
        return {
          start: `${match[1]}-${match[2]}`,
          end: `${match[2]}-${match[3] || match[2]}`
        };
      }
    }
    
    return undefined;
  }

  private extractCargoRequirements(text: string): any {
    const requirements: any = {};
    
    // Solo cargo
    if (/solo cargo|no combination|exclusive/i.test(text)) {
      requirements.solo_cargo = true;
    }
    
    // No transshipment
    if (/no transshipment|direct discharge|no trans/i.test(text)) {
      requirements.no_transshipment = true;
    }
    
    // Stowage requirements
    const stowageMatch = text.match(/stowage\s*:?\s*([^,\n]+)/i);
    if (stowageMatch) {
      requirements.stowage = stowageMatch[1].trim();
    }
    
    // Temperature requirements
    const tempMatch = text.match(/temperature\s*:?\s*([^,\n]+)/i);
    if (tempMatch) {
      requirements.temperature = tempMatch[1].trim();
    }
    
    // Dimensions
    const diameterMatch = text.match(/(?:max|maximum)\s+diameter\s*:?\s*(\d+)\s*mm/i);
    if (diameterMatch) {
      requirements.max_diameter_mm = parseInt(diameterMatch[1]);
    }
    
    const lengthMatch = text.match(/(?:max|maximum)\s+length\s*:?\s*(\d+)\s*mm/i);
    if (lengthMatch) {
      requirements.max_length_mm = parseInt(lengthMatch[1]);
    }
    
    return Object.keys(requirements).length > 0 ? requirements : undefined;
  }

  private extractFreightRate(text: string): string | undefined {
    const patterns = [
      /freight\s+rate\s*:?\s*([^\n]+)/i,
      /rate\s*:?\s*\$?\s*(\d+(?:\.\d+)?)\s*(?:pmt|per mt|\/mt)/i,
      /usd\s*(\d+(?:\.\d+)?)\s*(?:pmt|per mt|\/mt)/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    return undefined;
  }

  private extractPaymentTerms(text: string): string | undefined {
    const patterns = [
      /payment\s+terms?\s*:?\s*([^\n]+)/i,
      /(fio|fiost|fiot|liner terms|gross terms)/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    return undefined;
  }

  // Vessel extraction methods
  private extractVesselName(text: string): string | undefined {
    const patterns = [
      /(?:mv|m\/v|mt|m\/t|ss|ms|m\/s)\s+([A-Za-z][A-Za-z\s]+?)(?:\s+\d|,|\.|$)/i,
      /vessel\s+name\s*:?\s*([A-Za-z][A-Za-z\s]+?)(?:\n|,|$)/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    return undefined;
  }

  private extractIMO(text: string): string | undefined {
    const pattern = /imo\s*:?\s*(\d{7})/i;
    const match = text.match(pattern);
    return match ? match[1] : undefined;
  }

  private extractDWT(text: string): number | undefined {
    const patterns = [
      /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*dwt/i,
      /dwt\s*:?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return parseFloat(match[1].replace(/,/g, ''));
      }
    }
    
    return undefined;
  }

  private extractVesselDimensions(text: string): { loa?: number; beam?: number; draft?: number } | undefined {
    const dimensions: any = {};
    
    // LOA
    const loaMatch = text.match(/(?:loa|length)\s*:?\s*(\d+(?:\.\d+)?)\s*m/i);
    if (loaMatch) {
      dimensions.loa = parseFloat(loaMatch[1]);
    }
    
    // Beam
    const beamMatch = text.match(/beam\s*:?\s*(\d+(?:\.\d+)?)\s*m/i);
    if (beamMatch) {
      dimensions.beam = parseFloat(beamMatch[1]);
    }
    
    // Draft
    const draftMatch = text.match(/(?:draft|draught)\s*:?\s*(\d+(?:\.\d+)?)\s*m/i);
    if (draftMatch) {
      dimensions.draft = parseFloat(draftMatch[1]);
    }
    
    return Object.keys(dimensions).length > 0 ? dimensions : undefined;
  }

  private extractHolds(text: string): number | undefined {
    const pattern = /(\d+)\s*holds?/i;
    const match = text.match(pattern);
    return match ? parseInt(match[1]) : undefined;
  }

  private extractHatches(text: string): number | undefined {
    const pattern = /(\d+)\s*hatches/i;
    const match = text.match(pattern);
    return match ? parseInt(match[1]) : undefined;
  }

  private extractETA(text: string): string | undefined {
    const pattern = /eta\s*:?\s*([^\n,]+)/i;
    const match = text.match(pattern);
    return match ? match[1].trim() : undefined;
  }

  private extractNextOpen(text: string): string | undefined {
    const patterns = [
      /(?:open|available)\s*(?:at|in)?\s*([A-Za-z\s]+)\s*(?:on|from)?\s*([^\n,]+)/i,
      /next\s+open\s*:?\s*([^\n,]+)/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    return undefined;
  }

  private extractCurrentPosition(text: string): string | undefined {
    const patterns = [
      /(?:current\s+)?position\s*:?\s*([A-Za-z\s]+)/i,
      /(?:now|currently)\s+(?:at|in)\s+([A-Za-z\s]+)/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    return undefined;
  }

  private extractVesselCapabilities(text: string): { geared?: boolean; crane_capacity?: string } {
    const capabilities: any = {};
    
    // Check if geared
    if (/geared|with cranes?|self-geared/i.test(text)) {
      capabilities.geared = true;
    } else if (/gearless|no cranes?/i.test(text)) {
      capabilities.geared = false;
    }
    
    // Extract crane capacity
    const craneMatch = text.match(/(\d+)\s*(?:x|×)?\s*(\d+)\s*(?:t|ton|tons)\s+crane/i);
    if (craneMatch) {
      capabilities.crane_capacity = `${craneMatch[1]}x${craneMatch[2]}T`;
    }
    
    return capabilities;
  }

  private extractVesselType(text: string): string | undefined {
    const vesselTypes = [
      'bulk carrier', 'bulker', 'handymax', 'handysize', 'supramax', 'ultramax',
      'panamax', 'capesize', 'newcastlemax', 'vloc',
      'tanker', 'vlcc', 'suezmax', 'aframax', 'panamax tanker',
      'chemical tanker', 'product tanker', 'crude tanker',
      'container vessel', 'container ship', 'feeder', 'ultra large container vessel',
      'general cargo', 'multipurpose', 'mpp', 'heavy lift',
      'roro', 'pctc', 'car carrier', 'lng carrier', 'lpg carrier'
    ];
    
    const lowerText = text.toLowerCase();
    for (const type of vesselTypes) {
      if (lowerText.includes(type)) {
        return type;
      }
    }
    
    return undefined;
  }

  private extractFlag(text: string): string | undefined {
    const pattern = /flag\s*:?\s*([A-Za-z\s]+?)(?:\n|,|$)/i;
    const match = text.match(pattern);
    return match ? match[1].trim() : undefined;
  }

  private extractYearBuilt(text: string): number | undefined {
    const patterns = [
      /(?:built|year built)\s*:?\s*(\d{4})/i,
      /(\d{4})\s+built/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return parseInt(match[1]);
      }
    }
    
    return undefined;
  }

  private extractClassSociety(text: string): string | undefined {
    const classSocieties = ['abs', 'bv', 'ccs', 'dnv', 'gl', 'kr', 'lr', 'nk', 'rina', 'rs'];
    const lowerText = text.toLowerCase();
    
    for (const society of classSocieties) {
      if (lowerText.includes(society)) {
        return society.toUpperCase();
      }
    }
    
    return undefined;
  }

  private extractIceClass(text: string): string | undefined {
    const pattern = /ice\s+class\s*:?\s*([A-Za-z0-9]+)/i;
    const match = text.match(pattern);
    return match ? match[1] : undefined;
  }
}