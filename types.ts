// A collection of shared types across the website and functions

export interface Profile {
  alive: boolean;
  chaser: string;
  class: string;
  dayorboard: string;
  firstName: string;
  lastName: string;
  tags: number;
  target: string;
  location?: string;
}

export interface ClientProfile {
  name: string;
  target: string;
  alive: boolean;
  tags: number;
  location: string;
}

export interface ClientTaggedOutResponse {
  status: number;
}
