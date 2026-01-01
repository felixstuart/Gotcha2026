// A collection of shared types across the website and functions

export interface Profile {
  alive: boolean;
  chaser: string;
  class: string;
  dayorboard: string;
  firstName: string;
  lastName: string;
  tags: number;
  target: {
    firstName: string;
    lastName: string;
    email: string;
    location?: string;
  }
  location?: string;
}

export interface ClientProfile {
  name: string;
  target: {
    name: string;
    email: string;
    location?: string;
  }
  alive: boolean;
  tags: number;
  location?: string;
}

export interface ClientTaggedOutResponse {
  status: number;
}
