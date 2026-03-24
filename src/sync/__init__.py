"""Shared sync package: reusable sync logic for Garmin and Withings.

This package provides core sync functions that work with raw database connections
(not Streamlit session state) so they can be used by both the webapp (src/) and
the NAS scheduler (deploy/scheduler.py).
"""
