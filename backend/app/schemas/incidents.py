from typing import Literal
from pydantic import BaseModel, Field


class IncidentCreate(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    service: str = Field(min_length=2, max_length=100)
    environment: Literal["Production", "Staging", "Development"] = "Production"
    severity: Literal["Critical", "High", "Medium", "Low"] = "Medium"
    description: str = Field(min_length=8, max_length=10000)
    logs: str = Field(default="", max_length=30000)
    stack_trace: str = Field(default="", max_length=30000)


class ResolutionCreate(BaseModel):
    root_cause: str = Field(min_length=5, max_length=5000)
    solution: str = Field(min_length=5, max_length=5000)
    notes: str = Field(default="", max_length=5000)
    useful: Literal["Yes", "Partially", "No"] = "Yes"
