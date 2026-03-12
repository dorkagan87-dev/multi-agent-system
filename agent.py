class Agent:
    """
    Base class for all agents.
    """
    def __init__(self, name):
        self.name = name

    def act(self):
        raise NotImplementedError("Subclasses should implement this!")

class PlannerAgent(Agent):
    """
    Planner agent that creates plans based on goals.
    """
    def __init__(self, name):
        super().__init__(name)

    def plan(self, goals):
        # Implementation of the planning logic
        return f"Planning for goals: {goals}"

    def act(self):
        return self.plan(["goal1", "goal2"])

class ExecutorAgent(Agent):
    """
    Executor agent that carries out actions based on plans.
    """
    def __init__(self, name):
        super().__init__(name)

    def execute(self, plan):
        # Implementation of the execution logic
        return f"Executing: {plan}"

    def act(self):
        return self.execute("some plan")
